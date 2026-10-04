import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleMcp,hash,TOOLS,FLEET_SCOPES} from './src/mcp.js';
import {setup as apiSetup} from '../api/test-fixture.mjs';
import {syncXpacios} from '../api/src/admira-xpacio-sync.js';
import {handleItilInternal} from '../api/src/itil.js';

// ITIL (FLT-101300): MCP de flota → binding DESK → yokup-api /internal/itil/*. Ver docs/itil-yokup.md.
const full='ykm_'+'I'.repeat(43), reader='ykm_'+'R'.repeat(43), legacy='ykm_'+'L'.repeat(43);
const ITIL_TOOLS=['itil_xpacios_list','itil_inventory_get','itil_ci_upsert','itil_ci_retire'];
async function setup({desk=true}={}){
 const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('./migrations/0001_mcp.sql',import.meta.url),'utf8'));
 const add=async(t,scopes)=>db.prepare('INSERT INTO yokup_mcp_credentials VALUES(?,?,?,?,?,?,?,NULL)').run(await hash(t),'OraculoMacMini','MacMini','["yokup"]',JSON.stringify(scopes),1,Date.now()+60000);
 await add(full,[...FLEET_SCOPES]);await add(reader,['read','itil']);await add(legacy,['read','inbox','send','work','incidents','incidents:write']);
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 // yokup-api real con SQLite: la sync siembra un Xpacio con tres superficies del catálogo.
 const api=apiSetup();
 await syncXpacios(api.env,{fetcher:async()=>Response.json({locations:[{id:'alsea-sbux-021',name:'Starbucks Paseo de Gracia',kind:'Cafetería',addr:'Paseo de Gracia 103 · Barcelona',coords:[2.15979,41.39574],city:'Barcelona',circuit:'alsea_starbucks',external:{operator:'Alsea'},twin:'https://www.xpaceos.com/admira-xp/?loc=alsea-sbux-021',surfaces:[{name:'Menu board digital',surface:'pantalla'},{name:'Pantalla recogida',surface:'pantalla'},{name:'Escaparate',surface:'escaparate'}]}]})});
 const seen=[];
 const env={DB:{prepare:stmt},MCP_EXECUTOR_TOKEN:'executor-secret',RTC:{fetch:async()=>Response.json({ok:true})}};
 if(desk)env.DESK={fetch:async req=>{seen.push({url:req.url,method:req.method,auth:req.headers.get('authorization'),edge:req.headers.has('cf-connecting-ip')||req.headers.has('cf-ray'),body:req.method==='POST'?await req.clone().json():null});return handleItilInternal(req,api.env);}};
 const call=async(name,args={},token=full)=>(await handleMcp(new Request('https://yokup.com/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),env)).json();
 const list=async token=>(await (await handleMcp(new Request('https://yokup.com/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}),env)).json()).result.tools.map(t=>t.name);
 return {api,env,seen,call,list};
}
const ci={admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PAN-01',name:'Menu board caja',category:'pantalla',group_name:'Caja',position:'Pared izquierda',orientation:'horizontal',lifecycle:{serial:'SN-1',warranty_end:'2027-01-10',maintenance_interval_days:0}};

test('ITIL en el MCP de flota: scopes itil e itil:write separados; sin ellos ni se listan ni llegan a yokup-api',async()=>{
 const h=await setup();
 assert.deepEqual(TOOLS.filter(t=>t.scope.startsWith('itil')).map(t=>t.name),ITIL_TOOLS);
 assert.ok(FLEET_SCOPES.includes('itil')&&FLEET_SCOPES.includes('itil:write'),'la clave de flota los trae');
 const old=await h.list(legacy);assert.ok(ITIL_TOOLS.every(n=>!old.includes(n)));
 const ro=await h.list(reader);assert.ok(ro.includes('itil_xpacios_list')&&ro.includes('itil_inventory_get'));assert.ok(!ro.includes('itil_ci_upsert')&&!ro.includes('itil_ci_retire'));
 const all=await h.list(full);assert.ok(ITIL_TOOLS.every(n=>all.includes(n)));
 assert.equal((await h.call('itil_xpacios_list',{},legacy)).error.code,-32602);
 assert.equal((await h.call('itil_ci_upsert',ci,reader)).error.code,-32602);
 assert.equal((await h.call('itil_ci_retire',{itil_code:'PDG103-PAN-01',note:'x retirada'},reader)).error.code,-32602);
 assert.equal(h.seen.length,0);
 assert.equal((await h.call('itil_xpacios_list',{q:'gracia'},reader)).result.isError,false);assert.equal(h.seen.length,1);
 const {parseScopes}=await import('./tools/mcp-credential.mjs');
 assert.deepEqual(parseScopes('itil:write,read,itil'),['read','itil','itil:write']);assert.throws(()=>parseScopes('read,itil:write'));assert.deepEqual(parseScopes(undefined),['read','inbox','send','work']);
});

test('ITIL: el esquema rechaza código mal formado, categoría desconocida, campos extra y suplantar autor, sin llamar a yokup-api',async()=>{
 const h=await setup();
 for(const args of [{...ci,itil_code:'pdg103-pan-01'},{...ci,itil_code:'PDG103'},{...ci,category:'monitor'},{...ci,orientation:'diagonal'},{...ci,actor:'JobsGrokBot'},{...ci,machine:'GrokBot'},
  {...ci,lifecycle:{warranty_end:'10/01/2027'}},{...ci,lifecycle:{price:100}},{...ci,parent_itil_code:'nope'},{itil_code:'PDG103-PAN-01',name:'X',category:'pantalla'}])
  assert.equal((await h.call('itil_ci_upsert',args)).error?.code,-32602,JSON.stringify(args));
 assert.equal((await h.call('itil_ci_retire',{itil_code:'PDG103-PAN-01'})).error?.code,-32602,'retirar exige nota');
 assert.equal((await h.call('itil_xpacios_list',{limit:201})).error?.code,-32602);
 assert.equal(h.seen.length,0);
});

test('ITIL de extremo a extremo: gate → binding DESK (host interno, sin borde ni token) → yokup-api; firma persona · máquina',async()=>{
 const h=await setup();
 const up=await h.call('itil_ci_upsert',ci);assert.equal(up.result.isError,false,JSON.stringify(up));
 const out=up.result.structuredContent;assert.equal(out.created,true);assert.ok(!('ok' in out));assert.equal(out.retired_catalog.length,3);
 assert.equal(h.seen[0].url,'https://yokup-api.internal/internal/itil/ci/upsert');assert.equal(h.seen[0].auth,null);assert.equal(h.seen[0].edge,false);
 assert.equal(h.seen[0].body.actor,'OraculoMacMini');assert.equal(h.seen[0].body.machine,'MacMini');assert.equal(h.seen[0].body.lifecycle.maintenance_interval_days,null,'0 borra el intervalo');
 const row=h.api.db.prepare("SELECT created_by FROM itil_items WHERE itil_code='PDG103-PAN-01'").get();assert.equal(row.created_by,'OraculoMacMini · MacMini');
 assert.equal(h.api.db.prepare("SELECT actor,channel FROM itil_audit WHERE action='create'").get().channel,'mcp-flota');
 assert.equal((await h.call('itil_ci_upsert',ci)).result.structuredContent.changed,false,'idempotente');
 const listed=(await h.call('itil_xpacios_list',{brand:'alsea',limit:5})).result.structuredContent;assert.deepEqual(listed.xpacios.map(x=>[x.admira_store_id,x.managed_by]),[['alsea-sbux-021','itil']]);
 const inv=(await h.call('itil_inventory_get',{admira_store_id:'alsea-sbux-021'})).result.structuredContent;assert.equal(inv.managed_by,'itil');assert.equal(inv.cis.find(c=>c.itil_code).lifecycle.serial,'SN-1');
 const taken=await h.call('itil_ci_upsert',{...ci,admira_store_id:'no-existe'});assert.equal(taken.result.isError,true);assert.match(taken.result.content[0].text,/xpacio_not_found/);
 const ret=await h.call('itil_ci_retire',{itil_code:'PDG103-PAN-01',note:'Cambio de pantalla'});assert.equal(ret.result.structuredContent.changed,true);
 assert.ok(!JSON.stringify(h.seen).includes('executor-secret'));
});

test('ITIL sin binding DESK: error claro y nada se escribe',async()=>{
 const h=await setup({desk:false});const r=await h.call('itil_inventory_get',{admira_store_id:'alsea-sbux-021'});
 assert.equal(r.result.isError,true);assert.match(r.result.content[0].text,/DESK/);
 assert.equal(h.api.db.prepare("SELECT COUNT(*) n FROM itil_items WHERE managed_by='itil'").get().n,0);
});

test('wrangler.toml del gate declara el binding DESK a yokup-api',async()=>{
 const toml=await readFile(new URL('./wrangler.toml',import.meta.url),'utf8');
 assert.match(toml,/\[\[services\]\]\s*\nbinding = "DESK"\s*\nservice = "yokup-api"/);
});

test('wrangler.toml enruta /mcp de admira.biz al guardián y no se lleva el resto del host',async()=>{
 const toml=await readFile(new URL('./wrangler.toml',import.meta.url),'utf8');
 for(const pattern of ['admira.biz/mcp','admira.biz/mcp/*','www.admira.biz/mcp','www.admira.biz/mcp/*']){
  assert.match(toml,new RegExp('pattern = "'+pattern.replace(/\*/g,'\\*')+'"\\s*\\nzone_name = "admira.biz"'),pattern);
 }
 assert.doesNotMatch(toml,/pattern = "admira\.biz\/\*"/);
 assert.doesNotMatch(toml,/pattern = "www\.admira\.biz\/\*"/);
});
