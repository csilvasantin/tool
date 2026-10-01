import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),P=require('./yk-photo-references.js');
const site={site_id:'33c6fa18-01fa-40df-90a9-7b2939aae1a2',admira_store_id:'alsea-sbux-021'};
const ci={itil_code:'PDG103-BOT-01',managed_by:'itil',name:'Botellero'},item={reference_number:11,reference_id:'PG103-011',itil_code:ci.itil_code,status:'registered',photo:'./photos/sb-water-rack.webp',photo_scope:'element',asset_number:50};
const manifest={items:[item]};

test('las referencias solo corresponden al Xpacio confirmado y al CI ITIL exacto',()=>{
 const ref=P.resolve(manifest,site,ci);
 assert.equal(ref.id,'PG103-011');assert.equal(ref.number,11);
 assert.equal(ref.photo,'https://www.xpaceos.com/inventario/starbucks/photos/sb-water-rack.webp');
 assert.equal(ref.href,'https://www.xpaceos.com/inventario/starbucks/?view=references&ref=PG103-011');
 assert.equal(P.resolve(manifest,{admira_store_id:'alsea-sbux-022'},ci),null);
 assert.equal(P.resolve(manifest,{},ci),null);
 assert.equal(P.resolve(manifest,{...site,site_id:'otro-establecimiento'},ci),null,'un identificador incompatible no queda oculto por el otro');
 assert.equal(P.resolve(manifest,site,{...ci,itil_code:'PDG103-BOT-02'}),null);
 assert.equal(P.resolve(manifest,site,{...ci,itil_code:'pdg103-bot-01'}),null,'no se deducen coincidencias por nombre o mayúsculas');
 assert.equal(P.resolve(manifest,site,{...ci,managed_by:'catalogo'}),null);
});

test('número de referencia estable y ámbito fotográfico sin convertir candidatos en CIs',()=>{
 for(const patch of [{status:'candidate'},{status:'product_reference'},{reference_number:50},{reference_id:'PG103-050'},{photo_scope:'supuesto'}])assert.equal(P.resolve({items:[{...item,...patch}]},site,ci),null);
 assert.equal(P.resolve({items:[item,{...item}]},site,ci),null,'las coincidencias duplicadas son ambiguas');
 assert.equal(P.resolve(null,site,ci),null);
 const chair={itil_code:'PDG103-SIL-01',managed_by:'itil'};
 const chairRef=P.resolve({items:[{...item,itil_code:chair.itil_code,reference_number:7,reference_id:'PG103-007',photo_scope:'type'}]},site,chair);
 assert.match(chairRef.scopeLabel,/unidad concreta sin identificar/);
 const context=P.resolve({items:[{...item,photo_scope:'context'}]},site,ci);
 assert.match(context.scopeLabel,/parcialmente visible/);
});

test('solo se aceptan fotos HTTPS del directorio público previsto',()=>{
 for(const value of ['javascript:alert(1)','data:image/png;base64,a','https://evil.example/x.webp','https://www.xpaceos.com.evil.example/inventario/starbucks/photos/rack.webp','http://www.xpaceos.com/inventario/starbucks/photos/rack.webp','//evil.example/rack.webp','./photos/../private.webp','./photos/a.webp?secret=x','./photos/a.webp#x','./photos/%2e%2e/a.webp','https://name:password@www.xpaceos.com/inventario/starbucks/photos/a.webp'])assert.equal(P.photoUrl(value),null,value);
 assert.equal(P.photoUrl('./photos/a-1.webp'),'https://www.xpaceos.com/inventario/starbucks/photos/a-1.webp');
 assert.equal(P.photoUrl('https://www.xpaceos.com/inventario/starbucks/photos/a.webp'),'https://www.xpaceos.com/inventario/starbucks/photos/a.webp');
});

test('petición única compartida, sin cookies ni referencias privadas',async()=>{
 let calls=0;const load=P.createLoader(async(url,options)=>{
  calls++;assert.equal(url,'https://www.xpaceos.com/inventario/starbucks/references.json');
  assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
  assert.equal(options.headers,undefined);return{ok:true,json:async()=>manifest};
 });
 const [a,b]=await Promise.all([load(),load()]);assert.strictEqual(a,b);assert.equal(calls,1);
 assert.strictEqual(await load(),a);assert.equal(calls,1);
});

test('fallos de red, HTTP o JSON mantienen el inventario disponible y no crean bucles',async()=>{
 for(const fetcher of [async()=>{throw Error('offline');},async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw Error('json');}}),async()=>({ok:true,json:async()=>({invalid:true})})]){
  let calls=0;const load=P.createLoader(async(...args)=>{calls++;return fetcher(...args);});
  assert.deepEqual(await load(),{items:[]});assert.deepEqual(await load(),{items:[]});assert.equal(calls,1);
 }
});
