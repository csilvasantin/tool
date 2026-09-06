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
const contractStart = SRC.indexOf('const SYSTEM_NOTIFICATION_LIVE_MS');
const contractEnd = SRC.indexOf('// CONTADORES DEL MENÚ SUPERIOR', contractStart);
const contracts = new Function('__name', SRC.slice(contractStart, contractEnd) +
  '; return {notificationContract,notificationSummary,SYSTEM_NOTIFICATION_LIVE_MS,SYSTEM_NOTIFICATION_UNCONFIRMED_MS};')(() => {});

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

test('el contador del menú alarma sólo por bloqueo live y conserva todos los estados', () => {
  const i = SRC.indexOf('async function menuCounters(');
  const b = SRC.slice(i, SRC.indexOf('__name(menuCounters', i));
  assert.match(b, /notificationSummary\(notifRows, notifNow\)/, 'el menú comparte el clasificador factual');
  assert.match(b, /abiertas: notifSummary\.live/, 'el campo que pinta la alarma excluye sin confirmar, stale y backlog');
  assert.match(b, /thresholds_ms:/, 'publica los umbrales usados');
  assert.match(SRC, /"Cache-Control": "public, max-age=30"/, 'la alarma del menú no queda cacheada más de 30 s');
});

test('la API publica reloj, umbrales, estados y resumen sin borrar filas', () => {
  const b = ruta('/fleet/notificaciones');
  assert.match(SRC, /const SYSTEM_NOTIFICATION_LIVE_MS = 90 \* 1000/);
  assert.match(SRC, /const SYSTEM_NOTIFICATION_UNCONFIRMED_MS = 5 \* 60 \* 1000/);
  assert.match(b, /generated_at: now/);
  assert.match(b, /thresholds_ms:/);
  assert.match(b, /summary, abiertas: summary\.total_open/);
  assert.match(b, /notificaciones: rows/);
  assert.ok(!/DELETE FROM notifs/.test(SRC), 'clasificar stale nunca elimina el histórico');
});

test('los bordes 90 s y 300 s se clasifican con el reloj del servidor', () => {
  const now = 1_800_000_000_000;
  const at = (age, extra = {}) => contracts.notificationContract({status:'abierta',kind:'sistema',last_at:now-age,machine:'MacMini',...extra}, now);
  assert.equal(at(89_999).activity_state, 'live');
  assert.equal(at(90_000).activity_state, 'live');
  assert.equal(at(90_001).activity_state, 'unconfirmed');
  assert.equal(at(299_999).activity_state, 'unconfirmed');
  assert.equal(at(300_000).activity_state, 'unconfirmed');
  assert.equal(at(300_001).activity_state, 'stale');
  assert.equal(at(-1).activity_state, 'stale', 'un timestamp futuro nunca bloquea una máquina');
  assert.equal(at(now, {last_at:0}).activity_state, 'stale', 'un timestamp inválido falla cerrado');
  assert.equal(at(10, {status:'cerrada'}).activity_state, 'closed');
  assert.equal(at(10, {image:null}).blocks_machine, true, 'la ausencia de captura no altera la señal factual');
});

test('kinds no-sistema son backlog y el resumen deduplica máquinas live', () => {
  const now = 1_800_000_000_000;
  for (const kind of ['release','flota','bloqueo','auth','autenticacion',null,'']) {
    const row = contracts.notificationContract({status:'abierta',kind,last_at:now-1,machine:'MacMini'}, now);
    assert.equal(row.activity_state, 'backlog', kind);
    assert.equal(row.blocks_machine, false, kind);
  }
  const summary = contracts.notificationSummary([
    {status:'abierta',kind:'sistema',last_at:now-1,machine:'MacMini'},
    {status:'abierta',kind:'sistema',last_at:now-2,machine:' macmini '},
    {status:'abierta',kind:'sistema',last_at:now-100_000,machine:'MBP14'},
    {status:'abierta',kind:'sistema',last_at:now-400_000,machine:'MBP16'},
    {status:'abierta',kind:'release',last_at:now-1,machine:'MBP16'},
    {status:'cerrada',kind:'sistema',last_at:now-1,machine:'MacMini'}
  ], now);
  assert.deepEqual(summary, {total_open:5,live:2,unconfirmed:1,stale:1,backlog:1,affected_machines:1});
});

test('publicar NO exige perímetro: el vigilante no tiene navegador', () => {
  const gate = SRC.indexOf('if (PROTECTED.has(url.pathname)');
  assert.ok(SRC.indexOf('url.pathname === "/fleet/notificacion"') < gate,
    'la ruta se resuelve antes del guardia de sesión, como el resto de /fleet/*');
});

// FLT-2448 — MANDAMIENTO 15 «Cuenta tus tokens» (Carlos, 6-sep-2026): los agentes y
// consejeros declaran su consumo en Notificaciones. Un parte por agente, máquina y día;
// las cifras van en `datos`; el parte de ayer se cierra cuando llega el de hoy.
test('consumo: la huella lleva el kind y el día, y las cifras van en datos', () => {
  const b = SRC.slice(SRC.indexOf('url.pathname === "/fleet/notificacion" && req.method === "POST"'), SRC.indexOf('url.pathname === "/fleet/notificaciones"'));
  assert.match(b, /const esConsumo = kind === "consumo"/);
  assert.match(b, /\+ \(esConsumo \? "\|consumo\|" \+ dia : ""\)/, 'huella máquina|dueño|consumo|día');
  assert.match(b, /datos=COALESCE\(\?,datos\)/, 'un refresco actualiza las cifras');
  assert.match(b, /UPDATE notifs SET status='cerrada'[^;]*kind='consumo'/, 'el parte anterior del mismo agente se cierra al llegar el nuevo');
  assert.match(SRC, /ALTER TABLE notifs ADD COLUMN datos TEXT/, 'columna aditiva');
});

test('consumo: /fleet/consumo agrega por agente y máquina los últimos días', () => {
  const b = ruta('/fleet/consumo');
  assert.match(b, /kind='consumo' AND last_at>=\?/);
  assert.match(b, /por_agente/);
  assert.match(b, /total_tokens \+= Number\(d\.total \|\| d\.total_tokens \|\| 0\)/);
});

test('consumo no bloquea la máquina: un kind distinto de sistema es backlog', () => {
  const r = contracts.notificationContract({ status: 'abierta', kind: 'consumo', last_at: Date.now() - 1000 }, Date.now());
  assert.equal(r.activity_state, 'backlog'); assert.equal(r.blocks_machine, false);
});
