// Importar inventario del Arquitecto (DCL-66d9ae0d5e756d0067127f24): el traspaso desde admira.biz/arquitecto.html
// (#arquitecto=v0|v1.…), su validación y límites, el plan de alta y el alta idempotente contra una API de mentira
// con las reglas de Yokup (upsert por itil_code, 409 si el código es de otro establecimiento, plano con base_sha256).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('./arquitecto-traspaso.js');
const read = f => readFileSync(new URL('./' + f, import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('../docs/arquitecto-traspaso.json', import.meta.url), 'utf8'));
const clon = o => JSON.parse(JSON.stringify(o));
const b64url = bytes => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function deflar(texto) {
  return new Uint8Array(await new Response(new Blob([new TextEncoder().encode(texto)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}

test('el enlace del Arquitecto: v0 (el contrato compartido con clearchannel-tv) y v1 comprimido', async () => {
  assert.equal(T.leerFragmento('#arquitecto=' + fixture.v0), fixture.v0);
  assert.equal(T.leerFragmento('arquitecto=v1.abc_-'), 'v1.abc_-');
  for (const h of ['', '#itil', '#arquitecto=', '#arquitecto=v2.abc', '#arquitecto=v1.a b', '#arquitecto=v1.abc&x=1']) assert.equal(T.leerFragmento(h), null, h);
  const d0 = await T.decodificar(fixture.v0);
  assert.equal(d0.ok, true); assert.deepEqual(d0.inventario, fixture.inventario);
  const d1 = await T.decodificar('v1.' + b64url(await deflar(JSON.stringify(fixture.inventario))));
  assert.deepEqual(d1.inventario, fixture.inventario);
  assert.equal(T.validar(d1.inventario).ok, true);
});

test('límites: enlace largo, bomba de compresión, base64 o JSON rotos', async () => {
  assert.equal((await T.decodificar('v0.' + 'A'.repeat(T.MAX_FRAGMENTO))).error, 'grande');
  const bomba = 'v1.' + b64url(await deflar(' '.repeat(5 * 1024 * 1024)));
  assert.ok(bomba.length < T.MAX_FRAGMENTO, 'cabe en el enlace…');
  assert.equal((await T.decodificar(bomba)).error, 'grande', '…pero descomprimido pasa del tope y se corta');
  assert.equal((await T.decodificar('v0.' + b64url(new TextEncoder().encode('{no es json')))).error, 'json');
  assert.equal((await T.decodificar('v1.' + b64url(new TextEncoder().encode('no es deflate')))).ok, false);
  assert.equal((await T.decodificar('x1.abc')).error, 'formato');
  assert.equal((await T.decodificar('v0.' + b64url(new Uint8Array([0xff, 0xfe])))).error, 'json', 'UTF-8 inválido');
});

test('validación: esquema, códigos ITIL, categorías, relaciones y textos (el contenido no es confiable)', () => {
  assert.deepEqual(T.validar({ schema: 'otro' }).errores.map(e => e.codigo), ['esquema']);
  const inv = clon(fixture.inventario);
  inv.cis.push({ itil_code: 'labarq-pan-02', name: 'x', category: 'tele', orientation: 'diagonal', parent_itil_code: 'NO VALE' },
    { itil_code: 'LABARQ-PLY-01', name: 'Repetido', category: 'player' });
  assert.deepEqual(T.validar(inv).errores.map(e => e.codigo), ['codigo', 'categoria', 'nombre', 'orientacion', 'padre', 'repetido']);
  const ciclo = clon(fixture.inventario);
  ciclo.cis[0].parent_itil_code = 'LABARQ-PAN-01';
  assert.ok(T.validar(ciclo).errores.some(e => e.codigo === 'ciclo'));
  const sucio = clon(fixture.inventario);
  sucio.cis[1].name = '  Pantalla\u0000 <img src=x>\n' + 'x'.repeat(400);
  const v = T.validar(sucio);
  assert.equal(v.ok, true);
  assert.equal(v.inventario.cis[1].name.length, 160);
  assert.doesNotMatch(v.inventario.cis[1].name, /[\u0000\n]/);
  const grande = clon(fixture.inventario);
  grande.plan.relleno = 'x'.repeat(T.MAX_PLAN);
  assert.ok(T.validar(grande).errores.some(e => e.codigo === 'plano-grande'));
  const sinPlano = clon(fixture.inventario); sinPlano.plan.schema = 'otro';
  assert.ok(T.validar(sinPlano).errores.some(e => e.codigo === 'plano'));
  const fuera = clon(fixture.inventario); fuera.cis[1].parent_itil_code = 'LABARQ-PLY-99';
  assert.deepEqual(T.validar(fuera).avisos.map(a => a.codigo), ['padre-fuera'], 'un padre de fuera debe existir ya en el establecimiento');
  const muchos = clon(fixture.inventario); muchos.cis = Array.from({ length: 201 }, (_, i) => ({ itil_code: 'LAB-PAN-' + String(i).padStart(3, '0'), name: 'Pantalla', category: 'pantalla' }));
  assert.ok(T.validar(muchos).errores.some(e => e.codigo === 'demasiados'));
});

test('el plano para el establecimiento: id del catálogo o el propio, y su site_id', () => {
  const plan = fixture.inventario.plan;
  const cat = T.ajustarPlan(plan, { site_id: 's-1', admira_store_id: 'alsea-sbux-021' });
  assert.equal(cat.id, 'alsea-sbux-021'); assert.equal(cat.yokup.site_id, 's-1');
  const propio = T.ajustarPlan(plan, { site_id: 's-2', admira_store_id: null });
  assert.equal(propio.id, 'lab-arquitecto');
  assert.equal(plan.yokup, undefined, 'sin tocar el original');
  assert.equal(T.kindDe('estanco'), 'tobacco'); assert.equal(T.kindDe('cafeteria'), 'hospitality'); assert.equal(T.kindDe('laboratorio'), 'other');
});

test('el plan de alta: padres antes, y qué pasa con cada CI frente a lo que ya hay', () => {
  const inv = T.validar(clon(fixture.inventario)).inventario;
  const orden = T.ordenAlta(inv.cis.slice().reverse()).map(c => c.itil_code);
  assert.deepEqual(orden, ['LABARQ-PLY-01', 'LABARQ-PAN-01']);
  let p = T.planificar(inv, { cis: [{ device_id: 'c1', itil_code: null, managed_by: 'catalogo', name: 'Pantalla 1', category: 'pantalla' }] });
  assert.deepEqual(p.pasos.map(x => x.accion), ['crear', 'crear']);
  assert.equal(p.retiraCatalogo, 1, 'el primer CI ITIL retira los provisionales del catálogo: se avisa');
  p = T.planificar(inv, { cis: inv.cis.map(c => ({ ...c, managed_by: 'itil' })) });
  assert.deepEqual(p.pasos.map(x => x.accion), ['igual', 'igual']); assert.equal(p.retiraCatalogo, 0);
  p = T.planificar(inv, { cis: [{ ...inv.cis[0], name: 'Otro nombre', managed_by: 'itil' }] });
  assert.deepEqual(p.pasos.map(x => x.accion), ['actualizar', 'crear']);
  p = T.planificar(inv, { cis: [{ ...inv.cis[0], managed_by: 'itil', lifecycle: { status: 'retired' } }] });
  assert.deepEqual(p.pasos.map(x => x.accion), ['conflicto', 'padre'], 'un padre retirado deja a sus hijos fuera');
  assert.deepEqual(T.cuerpoCi({ site_id: 's' }, { ...inv.cis[0], role: '' }, 'actualizar'), { site_id: 's', itil_code: 'LABARQ-PLY-01', name: inv.cis[0].name, category: 'player', group_name: 'Fondo', position: 'Pared Fondo' }, 'al actualizar, lo vacío no borra');
});

// Una API de mentira con las reglas de Yokup (docs/itil-yokup.md y docs/plano-yokup.md).
function yokup({ otros = {} } = {}) {
  const cis = new Map(), llamadas = []; let plano = null;
  const canon = o => JSON.stringify(o, Object.keys(o).sort());
  const api = async (path, body, method) => {
    llamadas.push((method || (body ? 'POST' : 'GET')) + ' ' + path.split('?')[0] + (body && body.itil_code ? ' ' + body.itil_code : ''));
    if (path.startsWith('/itil/inventory')) return { cis: [...cis.values()] };
    if (path === '/itil/cis') {
      if (otros[body.itil_code]) throw Object.assign(new Error('El código ITIL ya está en otro establecimiento.'), { status: 409 });
      if (body.parent_itil_code && !cis.has(body.parent_itil_code)) throw Object.assign(new Error('parent_not_found'), { status: 400 });
      const prev = cis.get(body.itil_code), next = { ...(prev || {}), ...body, managed_by: 'itil' };
      delete next.site_id;
      if (prev && canon(prev) === canon(next)) return { changed: false };
      cis.set(body.itil_code, next);
      return { changed: true, created: !prev, retired_catalog: prev || cis.size > 1 ? [] : ['cat:1'] };
    }
    if (path.startsWith('/plano') && !method) { if (!plano) throw Object.assign(new Error('Sin plano'), { status: 404 }); return { current: { sha256: plano.sha } }; }
    if (path === '/plano' && method === 'PUT') {
      const sha = 'sha:' + JSON.stringify(body.plan).length + ':' + JSON.stringify(body.plan).slice(0, 40);
      if (plano && plano.sha === sha) return { changed: false };
      if ((plano ? plano.sha : '') !== (body.base_sha256 || '')) throw Object.assign(new Error('plan_conflict'), { status: 409 });
      plano = { sha, plan: body.plan, seq: (plano ? plano.seq : 0) + 1 };
      return { changed: true, created: plano.seq === 1, seq: plano.seq, sha256: sha };
    }
    throw Object.assign(new Error('ruta'), { status: 404 });
  };
  return { api, cis, llamadas, get plano() { return plano; } };
}

test('el alta: CI con players antes que pantallas, después el plano; repetirla no escribe nada', async () => {
  const inv = T.validar(clon(fixture.inventario)).inventario, site = { site_id: 'site-1', admira_store_id: null, name: 'Lab' };
  const y = yokup(), pasos = [];
  const r1 = await T.importar({ inventario: inv, site, api: y.api, alPaso: p => pasos.push(p) });
  assert.deepEqual(y.llamadas, ['GET /itil/inventory', 'POST /itil/cis LABARQ-PLY-01', 'POST /itil/cis LABARQ-PAN-01', 'GET /plano', 'PUT /plano']);
  assert.equal(r1.creados, 2); assert.equal(r1.errores.length, 0); assert.deepEqual(r1.plano, { ok: true, changed: true, created: true, seq: 1 });
  assert.equal(r1.retiradosCatalogo, 1);
  assert.equal(y.plano.plan.yokup.site_id, 'site-1');
  assert.ok(pasos.some(p => p.plano && p.estado === 'guardado'));
  y.llamadas.length = 0;
  const r2 = await T.importar({ inventario: inv, site, api: y.api });
  assert.deepEqual(y.llamadas, ['GET /itil/inventory', 'GET /plano', 'PUT /plano'], 'ningún POST de CI la segunda vez');
  assert.equal(r2.iguales, 2); assert.equal(r2.creados, 0); assert.equal(r2.plano.changed, false);
});

test('un código de otro establecimiento falla él solo, sus hijos no se mandan y el plano se guarda igual', async () => {
  const inv = T.validar(clon(fixture.inventario)).inventario;
  const y = yokup({ otros: { 'LABARQ-PLY-01': true } });
  const r = await T.importar({ inventario: inv, site: { site_id: 'site-2' }, api: y.api });
  assert.deepEqual(r.errores.map(e => [e.ci, e.status || e.error]), [['LABARQ-PLY-01', 409], ['LABARQ-PAN-01', 'padre']]);
  assert.equal(r.saltados, 1); assert.equal(r.creados, 0);
  assert.ok(!y.llamadas.includes('POST /itil/cis LABARQ-PAN-01'));
  assert.equal(r.plano.ok, true);
});

test('la pantalla del portal: dentro del espacio de trabajo, con confirmación y sin innerHTML', () => {
  const html = read('retailer.html'), js = read('retailer-arquitecto.js'), css = read('retailer-arquitecto.css'), lib = read('arquitecto-traspaso.js');
  assert.match(html, /<script defer src="\/arquitecto-traspaso\.js\?v=\d+"><\/script><script defer src="\/retailer-arquitecto\.js\?v=\d+"><\/script>/);
  assert.match(html, /\/retailer-arquitecto\.css\?v=\d+/);
  const at = html.indexOf('id="arquitecto-import"');
  assert.ok(at > html.indexOf('id="workspace"') && at > html.indexOf('id="itil"') && at < html.indexOf('id="agent-connections"'), 'dentro del espacio de trabajo, tras el Inventario ITIL');
  for (const id of ['arq-import-file', 'arq-import-site', 'arq-import-new-site', 'arq-import-table', 'arq-import-ok', 'arq-import-go', 'arq-import-log', 'arq-import-open']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /id="arq-import-go" disabled>Dar de alta en Yokup/);
  assert.doesNotMatch(js + lib, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.match(js, /credentials: 'include'/);
  assert.match(js, /history\.replaceState\(/, 'el enlace sale de la barra de direcciones');
  assert.match(js, /\$\('#arq-import-ok'\)\.checked/, 'sin la casilla de revisión no hay alta');
  assert.match(js, /e\.detail\?\.kind !== 'retailer'/);
  assert.match(lib, /api\('\/plano', \{ site_id: site\.site_id, plan: ajustarPlan\(inventario\.plan, site\), base_sha256: base \}, 'PUT'\)/);
  assert.match(css, /@media\(max-width:650px\)/);
  assert.doesNotMatch(lib, /fetch\(/, 'lo puro no llama a la red: la API se inyecta');
});
