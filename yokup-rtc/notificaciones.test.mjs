// FLT-1020 — NOTIFICACIONES DEL SISTEMA DE LA FLOTA.
// MÁXIMA (Carlos, 24-jul-2026): «si algún equipo de AdmiraNeXT tiene una notificación
// del sistema hay que avisar; se captura pantalla y se pone en esa sección».
// Un diálogo modal deja al equipo PARADO, así que lo que se prueba aquí es que el
// aviso (a) no se duplique mientras el diálogo sigue, (b) no se pierda si la captura
// falla, y (c) se cierre solo cuando el diálogo desaparece.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const SRC = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const ruta = (p) => SRC.slice(SRC.indexOf(`url.pathname === "${p}"`), SRC.indexOf(`url.pathname === "${p}"`) + 2600);

test('la tabla guarda la huella, el estado y la captura', () => {
  assert.match(SRC, /CREATE TABLE IF NOT EXISTS notifs \(/, 'existe la tabla');
  const t = SRC.slice(SRC.indexOf('CREATE TABLE IF NOT EXISTS notifs'), SRC.indexOf('CREATE TABLE IF NOT EXISTS notifs') + 400);
  for (const col of ['fingerprint', 'machine', 'owner', 'image', 'status', 'first_at', 'last_at', 'seen_count']) {
    assert.ok(t.includes(col), 'columna ' + col);
  }
});

test('sólo puede haber UN aviso vivo por huella (índice parcial)', () => {
  assert.match(SRC, /CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_fp ON notifs\(fingerprint\) WHERE status='abierta'/,
    'el índice único es PARCIAL: un diálogo cerrado no impide avisar del siguiente igual');
});

test('publicar es idempotente: el mismo diálogo refresca, no duplica', () => {
  const b = ruta('/fleet/notificacion');
  assert.match(b, /SELECT id FROM notifs WHERE fingerprint=\? AND status='abierta'/, 'busca el vivo antes de insertar');
  assert.match(b, /seen_count=seen_count\+1/, 'cuenta las veces que se ha visto');
  assert.match(b, /nueva: false/, 'distingue el refresco del alta');
});

test('la PRIMERA captura manda: un refresco no la pisa', () => {
  const b = ruta('/fleet/notificacion');
  assert.match(b, /image=COALESCE\(image,\?\)/,
    'sólo se rellena si no había ninguna; la del momento en que apareció es la buena');
});

test('la huella es máquina+dueño, en minúsculas', () => {
  const b = ruta('/fleet/notificacion');
  assert.match(b, /machine\.toLowerCase\(\) \+ "\|" \+ owner\.toLowerCase\(\)/,
    'dos equipos con el mismo diálogo son dos avisos distintos');
});

test('el aviso se publica aunque NO haya captura', () => {
  const b = ruta('/fleet/notificacion');
  assert.match(b, /const image = String\(b\.image \|\| ""\)\.trim\(\)\.slice\(0, 400\) \|\| null/,
    'image es opcional');
  assert.ok(!/if \(!image\) return json\(\{ ok: false/.test(b),
    'que falle la cámara NO puede silenciar el aviso');
});

test('machine y owner sí son obligatorios: un aviso sin equipo no sirve', () => {
  const b = ruta('/fleet/notificacion');
  assert.match(b, /if \(!machine \|\| !owner\) return json\(\{ ok: false/, 'se rechaza lo que no se puede localizar');
});

test('el cierre lo puede dar el vigilante (desapareció) o una persona (ya lo atendí)', () => {
  const b = ruta('/fleet/notificacion');
  assert.match(b, /b\.cerrada === true \|\| b\.resuelta === true/, 'cierre desde el vigilante');
  assert.match(SRC, /url\.pathname === "\/fleet\/notificacion\/cerrar"/, 'cierre a mano desde la sección');
});

test('cerrar no borra: queda el rastro de cuánto estuvo parado el equipo', () => {
  const b = ruta('/fleet/notificacion');
  assert.match(b, /UPDATE notifs SET status='cerrada', closed_at=\?/, 'se marca, no se borra');
  assert.ok(!/DELETE FROM notifs/.test(SRC), 'ninguna ruta borra avisos');
});

test('el contador del menú sólo cuenta lo abierto', () => {
  const i = SRC.indexOf('async function menuCounters(');
  const b = SRC.slice(i, SRC.indexOf('__name(menuCounters', i));
  assert.match(b, /SELECT COUNT\(\*\) n FROM notifs WHERE status='abierta'/, 'sólo abiertas');
  assert.match(b, /out\.notificaciones = \{ abiertas:/, 'expone abiertas');
});

test('publicar NO exige perímetro: el vigilante no tiene navegador', () => {
  const gate = SRC.indexOf('if (PROTECTED.has(url.pathname)');
  assert.ok(SRC.indexOf('url.pathname === "/fleet/notificacion"') < gate,
    'la ruta se resuelve antes del guardia de sesión, como el resto de /fleet/*');
});
