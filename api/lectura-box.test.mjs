import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './test-fixture.mjs';
import worker from './src/index.js';
import {handleRetailer} from './src/retailer-portal.js';
import {mintLecturaToken, verifyLecturaToken, LECTURA_COOKIE, LECTURA_TTL_SECONDS} from './src/lectura-box.js';

const KEY = 'mbl_' + 'lectura-box-test-key-'.padEnd(40, 'x');

function withKey(base) {
  base.env.MEROVINGIO_BOX_LECTURA = KEY;
  return base;
}

test('el enlace caduca a las 8 h, la firma mala no entra y el sitio va dentro', async () => {
  const {token, exp, site} = await mintLecturaToken(KEY, 'yokup');
  assert.equal(site, 'yokup');
  assert.ok(exp - Math.floor(Date.now() / 1000) <= LECTURA_TTL_SECONDS);
  assert.ok(await verifyLecturaToken(KEY, token));
  assert.equal(await verifyLecturaToken(KEY, token + 'a'), null);
  assert.equal(await verifyLecturaToken('mbl_' + 'otra-clave-distinta-de-prueba-000000', token), null);
  assert.equal(await verifyLecturaToken(KEY, token, Date.now() + 9 * 60 * 60 * 1000), null);
});

test('canje único, la escritura con la clave o la cookie da 403 y el panel es visor', async () => {
  const box = withKey(setup());
  box.db.prepare('INSERT INTO retailer_accounts (id,email,name,password_hash,salt,created_at) VALUES (?,?,?,?,?,?)').run('id365', '365@brand.test', '365', '!locked', 'salt', 1);
  box.db.prepare('INSERT INTO brand_accounts (brand_key,retailer_id,name,created_at) VALUES (?,?,?,?)').run('365', 'id365', '365', 1);
  const {token} = await mintLecturaToken(KEY, 'yokup');
  const first = await worker.fetch(new Request('https://data.yokup.com/api/lectura/canjear?site=yokup&t=' + encodeURIComponent(token)), box.env);
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.role, 'viewer');
  assert.match(body.sid, /^[a-f0-9]{64}$/);
  const again = await worker.fetch(new Request('https://data.yokup.com/api/lectura/canjear?site=yokup&t=' + encodeURIComponent(token)), box.env);
  assert.equal(again.status, 410);
  const other = await worker.fetch(new Request('https://data.yokup.com/api/lectura/canjear?site=store&t=' + encodeURIComponent(token)), box.env);
  assert.equal(other.status, 401);

  const cookie = LECTURA_COOKIE + '=' + body.sid;
  const me = await handleRetailer(new Request('https://data.yokup.com/api/retailer/me', {headers:{Cookie:cookie, Origin:'https://www.yokup.com'}}), box.env);
  assert.equal(me.status, 200);
  const profile = await me.json();
  assert.equal(profile.access.can_edit, false);
  assert.equal(profile.access.role, 'viewer');
  assert.equal(profile.profile.name, '365');

  const write = await handleRetailer(new Request('https://data.yokup.com/api/retailer/sites', {method:'POST', headers:{Cookie:cookie, Origin:'https://www.yokup.com', 'Content-Type':'application/json'}, body:JSON.stringify({name:'No debe crearse', kind:'hospitality', country:'ES', city:'Barcelona', address:'Calle que no se guarda', latitude:41.39, longitude:2.17})}), box.env);
  assert.equal(write.status, 403);
  assert.equal(box.db.prepare('SELECT COUNT(*) AS n FROM retailer_sites').get().n, 0);

  const byKey = await worker.fetch(new Request('https://data.yokup.com/api/retailer/sites', {method:'POST', headers:{'X-Admira-Machine-Key':KEY, Origin:'https://www.yokup.com', 'Content-Type':'application/json'}, body:'{}'}), box.env);
  assert.equal(byKey.status, 403);
  const byBearer = await worker.fetch(new Request('https://data.yokup.com/api/retailer/itil/cis', {method:'DELETE', headers:{Authorization:'Bearer ' + KEY}}), box.env);
  assert.equal(byBearer.status, 403);

  box.env.MEROVINGIO_BOX_LECTURA = 'mbl_' + 'clave-rotada-que-invalida-sesiones-00';
  const dead = await worker.fetch(new Request('https://data.yokup.com/api/lectura/sesion?sid=' + body.sid), box.env);
  assert.equal(dead.status, 401);
  const after = await handleRetailer(new Request('https://data.yokup.com/api/retailer/me', {headers:{Cookie:cookie}}), box.env);
  assert.equal(after.status, 403);
});
