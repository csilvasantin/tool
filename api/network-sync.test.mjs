import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './test-fixture.mjs';
import {syncXpacios} from './src/admira-xpacio-sync.js';
import {handleItilInternal,handleItilPublic} from './src/itil.js';
import {validItilCode} from './src/itil-model.js';
import {routerItilCode,routerItilCodeAlt,routerCodeFromSiblings,applySignal,lifecycleStatus,simulateRouter,createNetworkAdapter,timeBucket} from './src/network-vendor.js';
import {syncNetworkRouters,syncAllNetworkRouters,scheduledNetworkSync} from './src/network-sync.js';

const surfaces=names=>names.map(([name,surface])=>({name,desc:'',status:'sched',surface}));
const sbux=()=>({id:'alsea-sbux-021',name:'Starbucks Paseo de Gracia',kind:'Cafetería · Starbucks',addr:'Paseo de Gracia 103 · Barcelona · 08008',coords:[2.15979,41.39574],city:'Barcelona',circuit:'alsea_starbucks',external:{brand:'Starbucks',operator:'Alsea'},twin:'https://www.xpaceos.com/admira-xp/?loc=alsea-sbux-021',surfaces:surfaces([['Menu board digital','pantalla'],['Pantalla recogida','pantalla'],['Escaparate','escaparate']])});
const jti=()=>({id:'jti-xtanco-001',name:'Estanco Juan Florez',kind:'Estanco · Xtanco',addr:'Rúa Juan Flórez 40 · A Coruña',coords:[-8.408523,43.365151],city:'A Coruña',circuit:'jti_xtanco',external:{brand:'Xtanco',sponsor:'JTI'},twin:'https://www.xpaceos.com/admira-xp/?loc=jti-xtanco-001',surfaces:surfaces([['LED Frontal','pantalla']])});
const serve=list=>async()=>new Response(JSON.stringify({locations:list}),{status:200});
const NOW=Date.parse('2026-10-05T11:00:00Z');
async function seeded(){const h=setup();const r=await syncXpacios(h.env,{fetcher:serve([sbux(),jti()])});assert.equal(r.error,null);return h;}

test('código RED-01 cabe en la regex ITIL y no cambia con el cubo de tiempo',()=>{
 assert.equal(routerItilCode('alsea-sbux-021'),'ALSEASBUX021-RED-01');
 assert.equal(routerItilCode('altadis-bcn-001'),'ALTADISBCN0-01-RED-01');
 assert.equal(routerItilCode('jti-xtanco-001'),'JTIXTANCO001-RED-01');
 for(const id of ['alsea-sbux-021','altadis-bcn-001','a','ab', 'x'.repeat(30)])assert.ok(validItilCode(routerItilCode(id)),id);
 assert.ok(validItilCode(routerItilCodeAlt('alsea-sbux-021')));
 assert.equal(routerItilCode('alsea-sbux-021'),routerItilCode('alsea-sbux-021'));
 assert.equal(applySignal('online',-112),'degraded');
 assert.equal(applySignal('offline',-70),'offline');
 assert.equal(lifecycleStatus('online'),'operational');
 assert.equal(lifecycleStatus('degraded'),'degraded');
 assert.equal(lifecycleStatus('offline'),'maintenance');
 const a=simulateRouter('alsea-sbux-021',NOW),b=simulateRouter('alsea-sbux-021',NOW+1000);
 assert.deepEqual(a,b);assert.notDeepEqual(a,simulateRouter('alsea-sbux-021',NOW+11*60*1000));
 assert.equal(a.model,simulateRouter('alsea-sbux-021',NOW+11*60*1000).model);
 assert.ok(['RUT241','RUTX11','RUT956'].includes(a.model));
 assert.equal(timeBucket(NOW),timeBucket(NOW+1000));
});

test('el simulador crea un CI red por Xpacio, es idempotente y no congela ni retira el catálogo',async()=>{
 const {env,db}=await seeded();
 const before=db.prepare('SELECT COUNT(*) n FROM installer_devices').get().n;
 const menu=db.prepare("SELECT device_id FROM admira_xpacio_devices WHERE admira_store_id='alsea-sbux-021' AND surface_key='menu-board-digital'").get().device_id;
 const first=await syncAllNetworkRouters(env,{now:NOW,trigger:'test'});
 assert.equal(first.created,2);assert.equal(first.conflicts,0);assert.equal(first.source,'simulated');
 const again=await syncAllNetworkRouters(env,{now:NOW,trigger:'test'});
 assert.equal(again.created,0);assert.equal(again.unchanged,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM installer_devices').get().n,before+2);
 const row=db.prepare("SELECT i.itil_code,i.category,i.managed_by,i.created_by,lc.status,lc.model,t.payload FROM itil_items i JOIN device_lifecycle lc ON lc.device_id=i.device_id JOIN itil_network_telemetry t ON t.device_id=i.device_id WHERE i.device_id='net-alsea-sbux-021'").get();
 assert.equal(row.itil_code,'ALSEASBUX021-RED-01');assert.equal(row.category,'red');assert.equal(row.managed_by,'itil');assert.equal(row.created_by,'network-sync');
 assert.equal(row.model,JSON.parse(row.payload).model);assert.equal(JSON.parse(row.payload).source,'simulated');
 assert.equal(db.prepare('SELECT status FROM device_lifecycle WHERE device_id=?').get(menu).status,'operational');
 const renamed=await syncXpacios(env,{fetcher:serve([Object.assign(sbux(),{coords:[2.16,41.4]}),jti()]),force:true});
 assert.equal(renamed.itil_managed,0);assert.equal(db.prepare('SELECT latitude FROM installer_devices WHERE id=?').get(menu).latitude,41.4);
 assert.equal(db.prepare('SELECT status FROM device_lifecycle WHERE device_id=?').get(menu).status,'operational');
 const pub=await handleItilPublic(new Request('https://data.yokup.com/api/itil/xpacios/alsea-sbux-021'),env,NOW);
 const body=await pub.json();
 assert.equal(body.access,'public');assert.equal(body.cis,undefined);assert.equal(body.summary.by_category.red,1);
 assert.equal(body.network.length,1);assert.equal(body.network[0].source,'simulated');assert.equal(body.network[0].badge,'SIMULADO');assert.equal(body.network[0].code,'ALSEASBUX021-RED-01');
 const raw=JSON.stringify(body);assert.ok(!raw.includes(JSON.parse(row.payload).serial));assert.ok(!raw.includes(JSON.parse(row.payload).imei));assert.ok(!raw.includes('41.39'));
 const internal=await handleItilInternal(new Request('https://yokup-api.internal/internal/itil/xpacios/alsea-sbux-021'),env);
 const inv=await internal.json();
 const ci=inv.cis.find(c=>c.itil_code==='ALSEASBUX021-RED-01');
 assert.equal(ci.network.serial,JSON.parse(row.payload).serial);assert.equal(ci.network.source,'simulated');
});

test('la pasada programada espera 10 minutos y el stub real no llama a RMS sin token',async()=>{
 const {env}=await seeded();
 const first=await scheduledNetworkSync(env,NOW);assert.equal(first.created,2);
 const recent=await scheduledNetworkSync(env,NOW+60*1000);assert.equal(recent.skipped,'recent');
 const later=await scheduledNetworkSync(env,NOW+11*60*1000);assert.equal(later.updated,2);
 const page=await syncNetworkRouters(env,{now:NOW,limit:1});assert.equal(page.done,false);assert.equal(page.seen,1);
 let calls=0;
 const blocked=createNetworkAdapter({NETWORK_SOURCE:'real',NETWORK_VENDOR:'teltonika-rms',NETWORK_FETCH(){calls++;throw new Error('no debe llamar');}},NOW);
 assert.equal(blocked.ready().skipped,'no_token');
 const listed=await blocked.listDevices([{admira_store_id:'alsea-sbux-021'}]);
 assert.equal(listed.skipped,'no_token');assert.equal(calls,0);
 const envReal={...env,NETWORK_SOURCE:'real',NETWORK_VENDOR:'teltonika-rms',TELTONIKA_RMS_TOKEN:'',NETWORK_FETCH(){calls++;throw new Error('no debe llamar');}};
 const skipped=await syncNetworkRouters(envReal,{now:NOW});assert.equal(skipped.skipped,'no_token');assert.equal(calls,0);
 let url='';
 const live=createNetworkAdapter({NETWORK_SOURCE:'real',TELTONIKA_RMS_TOKEN:'test-token-not-real',NETWORK_FETCH:async u=>{url=u;return {ok:true,json:async()=>({data:[]})};}},NOW);
 assert.equal(live.ready().ok,true);
 const empty=await live.listDevices([{admira_store_id:'alsea-sbux-021'}]);
 assert.equal(empty.skipped,'unmapped');assert.equal(url,'https://api.rms.teltonika-networks.com/devices');
 const other=createNetworkAdapter({NETWORK_VENDOR:'meraki',NETWORK_SOURCE:'simulated'},NOW);assert.equal(other.skipped,'vendor_unsupported');
});

test('un circuito demo nombra el router con el prefijo de sus equipos y renombra el código largo',async()=>{
 assert.equal(routerCodeFromSiblings(['365BCN01-ALTV-01','365BCN01-PANV-01','365BCN01-PANH-01']),'365BCN01-RED-01');
 assert.equal(routerCodeFromSiblings(['365BCN01-ALTV-01','365BCN02-PANV-01']),null);
 assert.equal(routerCodeFromSiblings(['365DEMOBCNTE-TUAN-RED-01']),null);
 const demo={id:'365-demo-bcn-tetuan',name:'365 · Plaça de Tetuan, 3',kind:'Cafetería · 365',addr:'Plaça de Tetuan 3 · Barcelona',coords:[2.176016,41.394094],city:'Barcelona',circuit:'demo_365_bcn',external:{brand:'365',operator:'Admira (demo)'},twin:'https://www.admira.store/admira-xp/?loc=365-demo-bcn-tetuan',surfaces:surfaces([['Altavoz','audio'],['Pantalla vertical','pantalla']])};
 const {env,db}=setup();
 const alta=await syncXpacios(env,{fetcher:serve([demo])});
 assert.equal(alta.error,null);assert.equal(alta.created,1);
 const primero=await syncAllNetworkRouters(env,{now:NOW,trigger:'test'});
 assert.equal(primero.created,1);assert.equal(primero.conflicts,0);
 assert.equal(db.prepare("SELECT itil_code FROM itil_items WHERE device_id='net-365-demo-bcn-tetuan'").get().itil_code,'365DEMOBCNTE-TUAN-RED-01');
 const equipos=db.prepare("SELECT device_id FROM admira_xpacio_devices WHERE admira_store_id='365-demo-bcn-tetuan' ORDER BY surface_key").all();
 assert.equal(equipos.length,2);
 db.prepare("UPDATE itil_items SET itil_code=?,managed_by='itil' WHERE device_id=?").run('365BCN01-ALTV-01',equipos[0].device_id);
 db.prepare("UPDATE itil_items SET itil_code=?,managed_by='itil' WHERE device_id=?").run('365BCN01-PANV-01',equipos[1].device_id);
 const segundo=await syncAllNetworkRouters(env,{now:NOW,trigger:'test'});
 assert.equal(segundo.conflicts,0);
 const row=db.prepare("SELECT itil_code,created_by FROM itil_items WHERE device_id='net-365-demo-bcn-tetuan'").get();
 assert.equal(row.itil_code,'365BCN01-RED-01');assert.equal(row.created_by,'network-sync');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM itil_items WHERE category='red'").get().n,1);
 const pub=await handleItilPublic(new Request('https://data.yokup.com/api/itil/xpacios/365-demo-bcn-tetuan'),env,NOW);
 const body=await pub.json();
 assert.equal(body.xpacio.brand,'365');
 assert.equal(body.network[0].code,'365BCN01-RED-01');
});
