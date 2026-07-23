// FLT-1008 — El Kit de venta de cada idea gana una 4ª pieza: una PRESENTACIÓN del
// Generador de Presentaciones de AdmiraNeXT. El endpoint POST /ideas/media aceptaba
// SOLO audio|video|pdf; ahora también «presentacion» (una URL http(s) al deck
// compartible, como los demás kinds). Se prueban por estructura del fuente los
// invariantes del handler —igual que media-content-type.test.mjs con /fleet/media,
// sin tocar el bundle ni añadir exports— y, extrayendo el Set aislado, su comportamiento.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');

// Segmento del handler POST /ideas/media (desde su guarda de ruta hasta el cierre del try).
const seg = source.slice(source.indexOf('/ideas/media" && req.method === "POST"'));
assert.ok(seg, 'no se encontró el handler POST /ideas/media');
const head = seg.slice(0, 1400);

// ── El Set MEDIA_KINDS, extraído y reconstruido, valida el comportamiento ──────
const setMatch = head.match(/const MEDIA_KINDS = [^;]*new Set\((\[[^\]]*\])\)/);
assert.ok(setMatch, 'no se encontró el Set MEDIA_KINDS en el handler');
const MEDIA_KINDS = new Set(JSON.parse(setMatch[1].replace(/'/g, '"')));

test('el kind nuevo «presentacion» es admitido', () => {
  assert.equal(MEDIA_KINDS.has('presentacion'), true);
});

test('los tres kinds de FLT-1007 (audio/video/pdf) siguen admitidos — no hay regresión', () => {
  for (const k of ['audio', 'video', 'pdf']) assert.equal(MEDIA_KINDS.has(k), true, k);
});

test('lo que no es un kind conocido se rechaza', () => {
  for (const k of ['', 'imagen', 'deck', 'slides', 'ppt', 'presentation']) {
    assert.equal(MEDIA_KINDS.has(k), false, k);
  }
});

// ── Invariantes del handler (por estructura del fuente) ──────────────────────
test('el mensaje de error del kind inválido enumera presentacion', () => {
  assert.match(head, /kind inválido \(audio\|video\|pdf\|presentacion\)/);
});

test('la url de la presentación se valida como http(s), igual que los demás kinds', () => {
  assert.match(head, /\/\^https\?:\\\/\\\/\\S\+\$\/i\.test\(murl\)/);
});

test('el media nuevo se FUSIONA sobre el existente (no pisa los otros kinds)', () => {
  // media[kind] = {...} escribe solo la clave del kind entrante; el resto se conserva.
  assert.match(head, /media\[kind\]\s*=\s*\{\s*url:\s*murl,\s*at:\s*Date\.now\(\)\s*\}/);
});

// ── GET /ideas devuelve el media (con presentacion dentro) ya parseado ────────
test('GET /ideas parsea y devuelve media (donde vive la presentacion)', () => {
  const g = source.slice(source.indexOf('/ideas" && (req.method === "GET"'));
  assert.match(g.slice(0, 900), /it\.media\s*=\s*JSON\.parse\(it\.media\)/);
});
