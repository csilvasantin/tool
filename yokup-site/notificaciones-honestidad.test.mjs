import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./notificaciones.html", import.meta.url), "utf8");
const frame = await readFile(new URL("./yk-frame.js", import.meta.url), "utf8");

test("el resumen separa live, sin confirmar e históricos", () => {
  for (const field of ["live","unconfirmed","stale","backlog","affected_machines"]) assert.match(html, new RegExp(field));
  assert.match(html, /avisos en vivo/);
  assert.match(html, /sin confirmar/);
  assert.match(html, /históricos/);
  assert.doesNotMatch(html, /equipos parados/);
});

test("las tarjetas no-sistema usan kind y título, no inventan quién lo pide", () => {
  assert.match(html, /const heading=system\?queEs\(n\.owner\):\(n\.titulo\|\|kindLabel\(kind\)\)/);
  assert.match(html, /const source=system\?/);
  assert.match(html, /Tipo <b>/);
  assert.match(html, /Lo pide <b>/);
  assert.match(html, /Bloqueo operativo/);
  assert.match(html, /Aviso de flota/);
});

test("los pendientes siguen accesibles en Todas y muestran edad factual", () => {
  assert.match(html, /data-f="todas"[^>]*>Todas/);
  assert.match(html, /pending desde|pendiente desde/);
  assert.match(html, /última señal hace/);
  assert.match(html, /n\.last_at_ms\|\|null/);
  assert.match(html, /SERVER_NOW\+Math\.max\(0,performance\.now\(\)-SYNC_PERF\)/);
});

test("un fallo conserva el snapshot o declara estado no disponible sin falso cero", () => {
  assert.match(html, /HAS_SNAPSHOT/);
  assert.match(html, /Se mantiene la última lectura/);
  assert.match(html, /No hay datos suficientes para afirmar que no existan avisos/);
  assert.match(html, /SNAPSHOT_STALE=true; render\(\)/, "el snapshot deja de afirmar live cuando falla el refresco");
  assert.match(html, /const live=SNAPSHOT_STALE\?0:/);
  assert.match(html, /\(reciente\?'<a class="go"/, "un snapshot stale no conserva la acción urgente");
  assert.match(html, /id="loadError" role="status" aria-live="polite" hidden/);
  assert.match(html, /id="resumen" role="status" aria-live="polite"/);
  assert.match(html, /id="retryLoad" type="button">Reintentar/);
});

test("los filtros son botones de teclado y el layout cubre móvil y escritorio", () => {
  assert.match(html, /data-f="abiertas" aria-pressed="true"/);
  assert.match(html, /data-f="todas" aria-pressed="false"/);
  assert.match(html, /setAttribute\("aria-pressed",String\(on\)\)/);
  assert.match(html, /tabindex="0" role="button" aria-label="Ampliar captura/);
  assert.match(html, /e\.key==="Escape"/);
  assert.match(html, /@media\(max-width:760px\)/);
  assert.match(html, /@media\(max-width:640px\)/);
});

test("el menú cuenta máquinas distintas y explica todos los estados sin la mentira antigua", () => {
  assert.match(frame, /affected_machines/);
  assert.match(frame, /máquinas afectadas ahora/);
  assert.match(frame, /avisos en vivo/);
  assert.match(frame, /sin confirmar/);
  assert.match(frame, /históricos/);
  assert.doesNotMatch(frame, /equipos parados/);
});

test("el panel de consumo (mandamiento 15) lee /fleet/consumo, señala a quien late sin declarar y no mezcla partes con avisos", () => {
  assert.match(html, /\/fleet\/consumo\?dias=7/);
  assert.match(html, /id="consumo" aria-labelledby="consumoTitulo"/);
  assert.match(html, /vivos sin declarar/);
  assert.match(html, /late hoy y no ha declarado/);
  assert.match(html, /No se pudieron leer los partes de consumo/, "un fallo del feed no afirma un consumo cero");
  assert.match(html, /data-f="consumo" aria-pressed="false">Partes de consumo/);
  assert.match(html, /n\.status==="abierta"&&!esCons\(n\)/, "los partes no cuentan como avisos pendientes");
  assert.match(html, /consumo:"Parte de consumo"/);
  assert.match(html, /function focoAhorro/);
});

test("el panel de consumo despliega las misiones del día por agente, parpadea el ocupado y señala quién no entrega capturas", () => {
  assert.match(html, /\/fleet\/missions\?agent=/);
  assert.match(html, /async function cargaMisiones/);
  assert.match(html, /function ocupado\(owner,machine\)/);
  assert.match(html, /OCUPADO_MS=10\*60\*1000/);
  assert.match(html, /@keyframes yk-blink/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /aria-expanded=/);
  assert.match(html, /sin captura de pantalla: información incompleta/);
  assert.match(html, /no se pudieron leer las misiones/, "un fallo del feed de misiones no se presenta como «sin misiones»");
});

test("bajo el quesito, agentes y consejeros van separados, una fila por cabeza y con la hora de su primera señal de hoy", () => {
  assert.match(html, /function inicioHoy\(owner,machine,dia\)/);
  assert.match(html, /const esConsejero=/);
  assert.match(html, /listaQueso\("Agentes"/);
  assert.match(html, /listaQueso\("Consejeros · GrokBot"/);
  assert.match(html, /primera señal de hoy: /);
  assert.match(html, /ninguna señal de hoy con hora/, "sin señal no se inventa una hora");
});

test("la cuadrícula de agentes tiene selector de periodo (hora ◀ día ▶ semana, mes, siempre), cuenta agentes y misiones del periodo y no afirma cero mientras carga", () => {
  assert.match(html, /const PER=\[\{k:"hora"/);
  assert.match(html, /\{k:"siempre"/);
  assert.match(html, /\/highscore\/history\?scope=global&desde=/);
  assert.match(html, /agentes que han intervenido en las <b>/);
  assert.match(html, /data-per="-1"/);
  assert.match(html, /data-per="1"/);
  assert.match(html, /Cargando las misiones /);
  assert.match(html, /No se pudieron leer las misiones /);
  assert.match(html, /sin parte de consumo en este periodo/);
  assert.match(html, /class="hoja"/);
  assert.match(html, /replace\(\/mbp\/g,"macbookpro"\)/, "NeoMBP14 del Highscore es NeoMacBookPro14 del parte");
});
