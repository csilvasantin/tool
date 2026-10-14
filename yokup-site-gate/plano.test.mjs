import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleMcp,hash,TOOLS,FLEET_SCOPES,MCP_VERSION,validate} from './src/mcp.js';
import {setup as apiSetup} from '../api/test-fixture.mjs';
import {syncXpacios} from '../api/src/admira-xpacio-sync.js';
import {handlePlanoInternal} from '../api/src/xpacio-plano.js';

// Plano maestro (1.5.0 · DCL-fbee86b0016fa4cef7a7726c): MCP de flota → binding DESK → yokup-api /internal/plano/*. Ver docs/plano-yokup.md.
const full='ykm_'+'P'.repeat(43), reader='ykm_'+'Q'.repeat(43), legacy='ykm_'+'L'.repeat(43);
const PLANO_TOOLS=['plano_get','plano_upsert'];
const walls=[{id:'F',a:[0,0],b:[14,0]},{id:'D',a:[14,0],b:[14,8]},{id:'P',a:[14,8],b:[0,8]},{id:'I',a:[0,8],b:[0,0]}];
const plan=(extra={})=>({schema:'admira.xpacio-plano/1',id:'alsea-sbux-021',version:'2026-10-14-esquematico-1',nombre:'Starbucks Paseo de Gracia 103',direccion:'Paseo de Gracia 103',
 planta:{ancho:14,fondo:8,alto:3.3},paredes:walls,pantallas:[{id:'v1',itil:null,orientacion:'vertical',pulgadas:55,pared:'F',s:5.7,z:1.75}],...extra});
async function setup({desk=true}={}){
 const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('./migrations/0001_mcp.sql',import.meta.url),'utf8'));
 const add=async(t,scopes)=>db.prepare('INSERT INTO yokup_mcp_credentials VALUES(?,?,?,?,?,?,?,NULL)').run(await hash(t),'OraculoMacMini','MacMini','["yokup"]',JSON.stringify(scopes),1,Date.now()+60000);
 await add(full,[...FLEET_SCOPES]);await add(reader,['read','itil']);await add(legacy,['read','inbox','send','work','incidents','incidents:write']);
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 const api=apiSetup();
 await syncXpacios(api.env,{fetcher:async()=>Response.json({locations:[{id:'alsea-sbux-021',name:'Starbucks Paseo de Gracia',kind:'Cafetería',addr:'Paseo de Gracia 103 · Barcelona',coords:[2.15979,41.39574],city:'Barcelona',circuit:'alsea_starbucks',external:{operator:'Alsea'},twin:'https://www.xpaceos.com/admira-xp/?loc=alsea-sbux-021',surfaces:[{name:'Menu board digital',surface:'pantalla'}]}]})});
 const seen=[];
 const env={DB:{prepare:stmt},MCP_EXECUTOR_TOKEN:'executor-secret',RTC:{fetch:async()=>Response.json({ok:true})}};
 if(desk)env.DESK={fetch:async req=>{seen.push({url:req.url,method:req.method,auth:req.headers.get('authorization'),edge:req.headers.has('cf-connecting-ip')||req.headers.has('cf-ray'),body:req.method==='POST'?await req.clone().json():null});return handlePlanoInternal(req,api.env);}};
 const rpc=(body,token)=>handleMcp(new Request('https://yokup.com/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify(body)}),env);
 const call=async(name,args={},token=full)=>(await rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},token)).json();
 const list=async token=>(await (await rpc({jsonrpc:'2.0',id:1,method:'tools/list'},token)).json()).result.tools.map(t=>t.name);
 return {api,env,seen,call,list};
}

test('plano en el MCP de flota 1.5.0: plano_get con itil y plano_upsert con itil:write; sin scope ni se listan ni llegan a yokup-api',async()=>{
 const h=await setup();
 assert.equal(MCP_VERSION,'1.5.0');
 assert.deepEqual(TOOLS.filter(t=>t.name.startsWith('plano_')).map(t=>[t.name,t.scope]),[['plano_get','itil'],['plano_upsert','itil:write']]);
 const old=await h.list(legacy);assert.ok(PLANO_TOOLS.every(n=>!old.includes(n)));
 const ro=await h.list(reader);assert.ok(ro.includes('plano_get')&&!ro.includes('plano_upsert'));
 const all=await h.list(full);assert.ok(PLANO_TOOLS.every(n=>all.includes(n)));
 assert.equal((await h.call('plano_get',{admira_store_id:'alsea-sbux-021'},legacy)).error.code,-32602);
 assert.equal((await h.call('plano_upsert',{admira_store_id:'alsea-sbux-021',plan:plan()},reader)).error.code,-32602);
 assert.equal(h.seen.length,0);
});

test('plano: el esquema rechaza plan que no es objeto, campos extra, autor suplantado y base_sha256 mal formado; uno de admira_store_id o site_id',async()=>{
 const h=await setup();
 for(const args of [{admira_store_id:'alsea-sbux-021'},{admira_store_id:'alsea-sbux-021',plan:[]},{admira_store_id:'alsea-sbux-021',plan:'{}'},{admira_store_id:'alsea-sbux-021',plan:plan(),actor:'JobsGrokBot'},
  {admira_store_id:'alsea-sbux-021',plan:plan(),machine:'GrokBot'},{admira_store_id:'alsea-sbux-021',plan:plan(),base_sha256:'XYZ'},{admira_store_id:'alsea sbux',plan:plan()},{site_id:'a/b',plan:plan()}])
  assert.equal((await h.call('plano_upsert',args)).error?.code,-32602,JSON.stringify(args).slice(0,90));
 assert.equal((await h.call('plano_get',{admira_store_id:'alsea-sbux-021',history:51})).error?.code,-32602);
 for(const args of [{},{admira_store_id:'alsea-sbux-021',site_id:'x'}]){const r=await h.call('plano_get',args);assert.equal(r.result.isError,true);assert.match(r.result.content[0].text,/uno de los dos/);}
 assert.equal(h.seen.length,0);
 assert.equal(validate({type:'object',additionalProperties:true},{a:{b:[1]}}),true);assert.equal(validate({type:'object',additionalProperties:true},null),false);
});

test('plano de extremo a extremo: gate → DESK (host interno, sin borde ni token) → yokup-api; firma persona · máquina; idempotente; errores de validación legibles',async()=>{
 const h=await setup();
 const up=await h.call('plano_upsert',{admira_store_id:'alsea-sbux-021',plan:plan(),base_sha256:''});assert.equal(up.result.isError,false,JSON.stringify(up));
 const out=up.result.structuredContent;assert.equal(out.created,true);assert.equal(out.changed,true);assert.equal(out.seq,1);assert.ok(!('ok' in out));
 assert.equal(h.seen[0].url,'https://yokup-api.internal/internal/plano/upsert');assert.equal(h.seen[0].auth,null);assert.equal(h.seen[0].edge,false);
 assert.equal(h.seen[0].body.actor,'OraculoMacMini');assert.equal(h.seen[0].body.machine,'MacMini');
 assert.equal(h.api.db.prepare('SELECT updated_by FROM xpacio_planos').get().updated_by,'OraculoMacMini · MacMini');
 assert.equal(h.api.db.prepare("SELECT channel FROM itil_audit WHERE action='plan-update'").get().channel,'mcp-flota');
 assert.equal((await h.call('plano_upsert',{admira_store_id:'alsea-sbux-021',plan:plan()})).result.structuredContent.changed,false,'idempotente');
 const conflict=await h.call('plano_upsert',{admira_store_id:'alsea-sbux-021',plan:plan({version:'v2'}),base_sha256:''});assert.equal(conflict.result.isError,true);assert.match(conflict.result.content[0].text,/plan_conflict/);
 const got=(await h.call('plano_get',{admira_store_id:'alsea-sbux-021',history:5},reader)).result.structuredContent;
 assert.equal(got.plan.version,'2026-10-14-esquematico-1');assert.equal(got.current.sha256,out.sha256);assert.equal(got.history.length,1);assert.ok(got.itil_check.warnings.some(w=>w.code==='catalog_screens'));
 assert.match(h.seen.at(-1).url,/\/internal\/plano\/get\?admira_store_id=alsea-sbux-021&history=5$/);
 const invalid=await h.call('plano_upsert',{admira_store_id:'alsea-sbux-021',plan:plan({paredes:walls.slice(0,2)})});
 assert.equal(invalid.result.isError,true);assert.match(invalid.result.content[0].text,/invalid_plan · Plano no válido: «paredes» debe ser una lista de 3 a 200/);
 const mismatch=await h.call('plano_upsert',{admira_store_id:'alsea-sbux-021',plan:plan({id:'otro-xpacio'})});assert.match(mismatch.result.content[0].text,/plan_id_mismatch/);
 assert.match((await h.call('plano_get',{site_id:'no-existe'})).result.content[0].text,/site_not_found/);
 assert.ok(!JSON.stringify(h.seen).includes('executor-secret'));
});

test('plano sin binding DESK: error claro y nada se escribe',async()=>{
 const h=await setup({desk:false});const r=await h.call('plano_upsert',{admira_store_id:'alsea-sbux-021',plan:plan()});
 assert.equal(r.result.isError,true);assert.match(r.result.content[0].text,/DESK/);
 assert.equal(h.api.db.prepare('SELECT COUNT(*) n FROM xpacio_planos').get().n,0);
});
