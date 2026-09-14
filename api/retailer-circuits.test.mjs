import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup} from './test-fixture.mjs';
import {handleRetailer} from './src/retailer-portal.js';
import {circuitIdForSite, circuitNameForSite, syncRetailerCircuits} from './src/admira-circuit-sync.js';

async function req(env,path,body,cookie){const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer'+path,{method:body?'POST':'GET',headers:{Origin:'https://www.yokup.com','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const site={name:'Estanco Jardinets Nº 3',kind:'tobacco',country:'ES',city:'Barcelona',address:'Passeig de Gràcia 100',latitude:41.39,longitude:2.16};

test('el id del circuito es legible, válido para Admira y único por establecimiento', () => {
  const id = circuitIdForSite({id:'9f1c2d3e-aaaa-bbbb', name:'Estanco Jardinets Nº 3'});
  assert.equal(id, 'estanco-jardinets-n-3-9f1c2d');
  assert.match(id, /^[a-z0-9][a-z0-9_-]{1,39}$/);
  assert.match(circuitIdForSite({id:'abc123ffff', name:'¡¡Ñandú Café & Co. con un nombre larguísimo de verdad!!'}), /^[a-z0-9][a-z0-9_-]{1,39}$/);
  assert.equal(circuitIdForSite({id:'x1', name:'***'}).startsWith('comercio-'), true);
  assert.equal(circuitNameForSite({name:'Tienda <b>', city:'Barcelona'}), 'Tienda b · Barcelona');
});

test('un establecimiento nuevo del comercio se da de alta como circuito sin canal, sin datos personales', async () => {
  const {env,db}=setup(); env.ADMIRA_CIRCUIT_SERVICE_KEY='svc';
  const a=await req(env,'/register',{name:'Retailer test',email:crypto.randomUUID()+'@example.test',password:'test-retailer-password'});
  const created=await req(env,'/sites',site,a.cookie); assert.equal(created.status,201);
  const calls=[]; const fetcher=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({ok:true,created:true}),{status:200});};
  assert.deepEqual(await syncRetailerCircuits(env,fetcher),{assigned:1,synced:1,failed:0});
  assert.equal(calls[0].url,'https://api.admira.store/grid/circuits');
  assert.equal(calls[0].init.headers.authorization,'Bearer svc');
  const body=JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(body).sort(),['actor','circuit','name','source']);
  assert.equal(body.source,'yokup-retailer'); assert.equal(body.name,'Estanco Jardinets Nº 3 · Barcelona');
  assert.doesNotMatch(calls[0].init.body,/example\.test|Passeig|41\.39/);
  assert.equal(db.prepare('SELECT status FROM retailer_site_circuits').get().status,'synced');
  assert.deepEqual(await syncRetailerCircuits(env,fetcher),{assigned:0,synced:0,failed:0});
  assert.equal(calls.length,1,'no repite altas ya confirmadas');
});

test('si Admira falla se reintenta y acaba en failed sin bloquear al comercio', async () => {
  const {env,db}=setup(); env.ADMIRA_CIRCUIT_SERVICE_KEY='svc';
  const a=await req(env,'/register',{name:'Retailer test',email:crypto.randomUUID()+'@example.test',password:'test-retailer-password'});
  await req(env,'/sites',site,a.cookie);
  const down=async()=>new Response(JSON.stringify({error:'bad-key'}),{status:403});
  for(let i=0;i<8;i++) await syncRetailerCircuits(env,down);
  const row=db.prepare('SELECT status,attempts,last_error FROM retailer_site_circuits').get();
  assert.deepEqual({...row},{status:'failed',attempts:8,last_error:'bad-key'});
  assert.deepEqual(await syncRetailerCircuits(env,async()=>{throw new Error('no debe llamar');}),{assigned:0,synced:0,failed:0});
});

test('sin clave de servicio no toca nada', async () => {
  const {env}=setup();
  assert.deepEqual(await syncRetailerCircuits(env,async()=>{throw new Error('no debe llamar');}),{skipped:true});
});

test('el worker sincroniza tras crear o importar establecimientos y en el cron', () => {
  const src=readFileSync(new URL('./src/index.js',import.meta.url),'utf8');
  assert.match(src,/syncRetailerCircuits/);
  assert.match(src,/scheduled\([^)]*\)\s*\{[^}]*syncRetailerCircuits/);
});
