// FLT-1007 c — La tubería de /fleet/media aceptaba SOLO image/* y GET /media/<key>
// servía los objetos viejos sin metadata como texto plano, así que el Kit de venta del
// Consejo (audio de la charla, vídeo y briefing PDF) no cabía y, si cabía, no se
// reproducía. Se prueba el COMPORTAMIENTO de la decisión de content-type (fleetMediaKind)
// extrayéndola aislada del fuente —igual que proof-image.test.mjs con normalizeProofImage,
// sin tocar el bundle ni añadir exports— y se cotejan por estructura los tres invariantes
// del handler: metadata al put, caída a image/png en el GET y la salvaguarda de purga.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const m = source.match(/function fleetMediaKind\(ct\) \{[\s\S]*?\n\}\n__name\(fleetMediaKind/);
assert.ok(m, 'no se encontró fleetMediaKind en el fuente');
const body = m[0].replace(/\n__name\(fleetMediaKind$/, '');
const fleetMediaKind = new Function(body + '\nreturn fleetMediaKind;')();

test('una imagen png se acepta y guarda con extensión png', () => {
  const r = fleetMediaKind('image/png');
  assert.equal(r.ok, true);
  assert.equal(r.ext, 'png');
  assert.equal(r.ct, 'image/png');
});

test('image/jpeg conserva su subtipo como extensión', () => {
  assert.equal(fleetMediaKind('image/jpeg').ext, 'jpeg');
});

test('el m4a entra por audio/mp4 y por audio/x-m4a, ambos con extensión m4a', () => {
  for (const t of ['audio/mp4', 'audio/x-m4a', 'audio/m4a']) {
    const r = fleetMediaKind(t);
    assert.equal(r.ok, true, t);
    assert.equal(r.ext, 'm4a', t);
    assert.equal(r.ct, t, t);
  }
});

test('el vídeo mp4 se acepta con extensión mp4', () => {
  const r = fleetMediaKind('video/mp4');
  assert.equal(r.ok, true);
  assert.equal(r.ext, 'mp4');
});

test('el briefing PDF se acepta con extensión pdf', () => {
  const r = fleetMediaKind('application/pdf');
  assert.equal(r.ok, true);
  assert.equal(r.ext, 'pdf');
});

test('ignora los parámetros del content-type (charset, boundary) y normaliza mayúsculas', () => {
  const r = fleetMediaKind('Application/PDF; charset=binary');
  assert.equal(r.ok, true);
  assert.equal(r.ext, 'pdf');
  assert.equal(r.ct, 'application/pdf');
});

test('rechaza con motivo lo que no es imagen/audio-mp4/vídeo-mp4/pdf', () => {
  for (const t of ['audio/ogg', 'video/webm', 'video/quicktime', 'text/plain', 'application/octet-stream', 'application/zip']) {
    const r = fleetMediaKind(t);
    assert.equal(r.ok, false, t);
    assert.match(r.error, /no admitido/, t);
  }
});

test('sin content-type se rechaza pidiéndolo, no en silencio', () => {
  for (const v of ['', '   ', null, undefined]) {
    const r = fleetMediaKind(v);
    assert.equal(r.ok, false);
    assert.match(r.error, /sin content-type/);
  }
});

// ── Invariantes del handler (por estructura del fuente) ──────────────────────
test('el POST /fleet/media guarda el content-type REAL como metadata del objeto R2', () => {
  const seg = source.slice(source.indexOf('/fleet/media" && req.method === "POST"'));
  assert.match(seg.slice(0, 1600), /httpMetadata:\s*\{\s*contentType:\s*kind\.ct\s*\}/,
    'debe persistir kind.ct en httpMetadata.contentType');
});

test('GET /media/<key> cae a image/png (no octet-stream) para los objetos viejos sin metadata', () => {
  assert.match(source, /obj\.httpMetadata\?\.contentType \|\| "image\/png"/);
  assert.ok(!/obj\.httpMetadata\?\.contentType \|\| "application\/octet-stream"/.test(source),
    'ya no debe quedar la caída antigua a octet-stream en el GET de /media');
});

test('el límite de tamaño de /fleet/media es 80MB (cabe el m4a de ~51MB)', () => {
  assert.match(source, /FLEET_MEDIA_MAX = 80 \* 1024 \* 1024/);
});

test('la purga solo alcanza fleet/ — m/ y shot/ quedan fuera del radio de daño', () => {
  const seg = source.slice(source.indexOf('/fleet/media/delete" && req.method === "POST"'));
  assert.match(seg.slice(0, 800), /\^fleet\\\//, 'debe exigir que el key empiece por fleet/');
});
