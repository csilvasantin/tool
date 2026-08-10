import test from "node:test";
import assert from "node:assert/strict";
import { evaluar, informe, sellosRecientes, TOPE_POR_HORA } from "./ritmo-publicacion.mjs";

const AHORA = Date.parse("2026-08-10T09:00:00Z");
const haceMin = (m) => Math.floor((AHORA - m * 60000) / 1000);
const linea = (hash, minutos, asunto) => `${hash}${haceMin(minutos)}${asunto}`;

// La noche del 9 al 10 de agosto: cinco sellos de madrugada. Es el caso que
// obliga a que exista este tope, así que es el primero que se prueba.
test("cinco publicaciones en una hora bloquean la sexta", () => {
  const lineas = [
    linea("aaaaaaa", 5, "chore(release): sellar yokup-rtc v.10.08.2026.r5.08:05"),
    linea("bbbbbbb", 15, "chore(release): sellar yokup-rtc v.10.08.2026.r4.01:01"),
    linea("ccccccc", 25, "chore(release): sellar yokup-rtc v.10.08.2026.r3.00:57"),
    linea("ddddddd", 35, "chore(release): sellar yokup-rtc v.10.08.2026.r2.00:39"),
    linea("eeeeeee", 45, "chore(release): sellar yokup-rtc v.10.08.2026.r1.00:01"),
  ];
  const r = evaluar({ lineas, ahora: AHORA });
  assert.equal(r.puede, false);
  assert.equal(r.sellos.length, 5);
  assert.equal(r.tope, 4);
});

test("cuatro caben; la quinta no", () => {
  const cuatro = [10, 20, 30, 40].map((m, i) => linea(`h${i}00000`, m, "chore(release): sellar Yokup"));
  assert.equal(evaluar({ lineas: cuatro, ahora: AHORA }).puede, false, "cuatro ya agotan el cupo");
  const tres = cuatro.slice(0, 3);
  assert.equal(evaluar({ lineas: tres, ahora: AHORA }).puede, true);
});

test("lo de hace más de una hora ya no cuenta", () => {
  const lineas = [61, 75, 90, 120].map((m, i) => linea(`v${i}00000`, m, "chore(release): sellar Yokup"));
  const r = evaluar({ lineas, ahora: AHORA });
  assert.equal(r.puede, true);
  assert.equal(r.sellos.length, 0);
});

// Publican varias máquinas contra el mismo repo: el mismo commit aparece en
// origin/main y en HEAD. Contarlo dos veces bloquearía a mitad de cupo.
test("un commit visto en remoto y en local cuenta una sola vez", () => {
  const uno = linea("dupdup0", 5, "chore(release): sellar Yokup");
  const r = evaluar({ lineas: [uno, uno, uno], ahora: AHORA });
  assert.equal(r.sellos.length, 1);
  assert.equal(r.puede, true);
});

test("un commit normal no es una publicación", () => {
  const lineas = [
    linea("f000001", 5, "fix(highscore): respetar proyecto principal diario"),
    linea("f000002", 6, "test(onidle): exige watcher persistente"),
    linea("f000003", 7, "feat(yokup-rtc): el agente puede crear sus propias subtareas"),
    linea("f000004", 8, "fix(incidencias): remove duplicate status tabs"),
    linea("f000005", 9, "fix(informes): offer honest load retry"),
  ];
  assert.equal(evaluar({ lineas, ahora: AHORA }).puede, true);
});

test("se reconoce también el formato antiguo «sellar Yokup rN»", () => {
  const lineas = [1, 2, 3, 4].map((n) => linea(`s00000${n}`, n * 5, `sellar Yokup r${n}`));
  assert.equal(evaluar({ lineas, ahora: AHORA }).sellos.length, 4);
});

// Un tope que no dice cuándo se abre obliga a reintentar a ciegas.
test("el mensaje dice cuánto falta y cómo saltarlo si arde", () => {
  const lineas = [5, 15, 25, 50].map((m, i) => linea(`m${i}00000`, m, "chore(release): sellar Yokup"));
  const r = evaluar({ lineas, ahora: AHORA });
  assert.equal(r.puede, false);
  assert.equal(r.libreEn, 10, "el más antiguo cumple la hora en 10 min");
  const texto = informe(r, { proyecto: "yokup-rtc", ahora: AHORA });
  assert.match(texto, /Publicación bloqueada/);
  assert.match(texto, /se libera un hueco en 10 min/i);
  assert.match(texto, /PUBLICACION_URGENTE/);
  assert.match(texto, /yokup-rtc/);
});

test("cuando hay hueco, el informe lo dice sin alarmar", () => {
  const r = evaluar({ lineas: [linea("ok00001", 5, "chore(release): sellar Yokup")], ahora: AHORA });
  assert.match(informe(r, { ahora: AHORA }), /1 de 4 publicaciones/);
});

test("el tope canónico es cuatro por hora", () => {
  assert.equal(TOPE_POR_HORA, 4);
});

test("una línea vacía o rota no cuenta como publicación", () => {
  assert.equal(sellosRecientes(["", "   ", "sinseparadores"], AHORA).length, 0);
});
