import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './test-fixture.mjs';
import {syncXpacios} from './src/admira-xpacio-sync.js';
import {handleItilInternal,resolveEquipo} from './src/itil.js';
import {parseEquipoRef,equipoCategory,equipoLabel,XPACEOS_TWIN_ALIASES,ciArgs} from './src/itil-model.js';
import {addMonths,warrantyUntil,lifecycleState} from './src/device-lifecycle.js';

// Ficha de inventario desde la incidencia (01-oct-2026): el «Equipo» del ticket Yokup → su CI ITIL.
const surfaces=names=>names.map(([name,surface])=>({name,desc:'',status:'sched',surface}));
const sbux={id:'alsea-sbux-021',name:'Starbucks Paseo de Gracia',kind:'Cafetería · Starbucks',addr:'Paseo de Gracia 103 · Barcelona · 08008',coords:[2.15979,41.39574],city:'Barcelona',circuit:'alsea_starbucks',external:{brand:'Starbucks',operator:'Alsea'},twin:'https://www.xpaceos.com/admira-xp/?loc=alsea-sbux-021',surfaces:surfaces([['Menu board digital','pantalla'],['Pantalla recogida','pantalla']])};
const serve=list=>async()=>new Response(JSON.stringify({locations:list}),{status:200});
const internal=(path,body)=>new Request('https://yokup-api.internal/internal/itil'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
const fleet=async(env,path,body)=>{const r=await handleItilInternal(internal(path,body&&{actor:'GrokBotExecutor',machine:'MacMini',...body}),env);return {status:r.status,body:await r.json()};};
async function seeded(){const h=setup();const r=await syncXpacios(h.env,{fetcher:serve([sbux])});assert.equal(r.error,null);return h;}
const NOW=Date.parse('2026-10-01T10:00:00Z');
const TPV_REF='demo:starbucks-alsea-paseo-de-gracia:tpv:manual:3ec933e9-0000-4000-8000-000000000000';

test('parseEquipoRef: forma del gemelo de XpaceOS y alias gemelo → Xpacio',()=>{
 assert.deepEqual(parseEquipoRef(TPV_REF),{store:'starbucks-alsea-paseo-de-gracia',admira_store_id:'alsea-sbux-021',equipo:'tpv',twin:true,manual:true});
 assert.deepEqual(parseEquipoRef('alsea-sbux-021:pantalla-2'),{store:'alsea-sbux-021',admira_store_id:'alsea-sbux-021',equipo:'pantalla-2',twin:false,manual:false});
 for(const ko of ['', 'PDG103-PAN-01','solo-una-parte','demo:', ':x', 'a b:c', null, undefined])assert.equal(parseEquipoRef(ko),null,String(ko));
 assert.equal(XPACEOS_TWIN_ALIASES['starbucks-alsea-paseo-de-gracia'],'alsea-sbux-021');assert.ok(Object.isFrozen(XPACEOS_TWIN_ALIASES));
 assert.equal(equipoCategory('tpv'),'tpv');assert.equal(equipoCategory('pantalla-3'),'pantalla');assert.equal(equipoCategory('altavoz'),'audio');assert.equal(equipoCategory('camara-1'),'iot');assert.equal(equipoCategory('lavavajillas'),null);
 assert.equal(equipoLabel('pantalla-3'),'Pantalla 3');assert.equal(equipoLabel('tpv'),'TPV');
});

test('garantía en meses: aditiva, el fin se calcula solo si falta y nunca se inventa',()=>{
 assert.equal(addMonths('2026-01-31',1),'2026-02-28');assert.equal(addMonths('2024-01-31',1),'2024-02-29');assert.equal(addMonths('2025-10-01',24),'2027-10-01');
 assert.equal(addMonths('2026-13-01',1),null);assert.equal(addMonths('2026-01-01',0),null);assert.equal(addMonths(null,12),null);
 assert.deepEqual(warrantyUntil({warranty_end:'2027-01-01',warranty_months:6,warranty_start:'2026-01-01'}),{until:'2027-01-01',derived:false},'manda la fecha registrada');
 assert.deepEqual(warrantyUntil({purchase_date:'2025-10-01',warranty_months:24}),{until:'2027-10-01',derived:true});
 assert.deepEqual(warrantyUntil({warranty_months:24}),{until:null,derived:false},'sin fecha de partida no hay fin');
 const s=lifecycleState({purchase_date:'2024-01-15',warranty_months:12},'2026-10-01');assert.equal(s.warranty,'expired');assert.equal(s.warranty_until,'2025-01-15');assert.equal(s.warranty_until_derived,true);
 assert.equal(lifecycleState({},'2026-10-01').warranty,'none');
 assert.deepEqual(ciArgs({request_key:'k',itil_code:'AB-CD',lifecycle:{warranty_months:0,maintenance_interval_days:0}}),{itil_code:'AB-CD',lifecycle:{warranty_months:null,maintenance_interval_days:null}});
});

test('itil_ci_upsert acepta warranty_months (1-600) y la ficha lo devuelve con el fin calculado',async()=>{
 const {env,db}=await seeded();
 const ok=await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-TPV-01',name:'TPV caja',category:'tpv',lifecycle:{serial:'SN-PRUEBA-1',purchase_date:'2026-02-01',warranty_months:24}});
 assert.equal(ok.status,200,JSON.stringify(ok.body));assert.equal(ok.body.ci.lifecycle.warranty_months,24);assert.equal(ok.body.ci.lifecycle.warranty_until,'2028-02-01');assert.equal(ok.body.ci.lifecycle.warranty_end,null,'no se escribe un fin que nadie registró');
 assert.equal(db.prepare("SELECT warranty_months FROM device_lifecycle WHERE device_id=?").get(ok.body.device_id).warranty_months,24);
 for(const bad of [0,601,1.5,'12'])assert.equal((await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-TPV-01',name:'TPV caja',category:'tpv',lifecycle:{warranty_months:bad}})).body.code,'invalid_warranty_months',String(bad));
});

test('equipo de la incidencia → CI: código, gemelo por categoría única, ambiguo, sin inventario y perímetro del binding',async()=>{
 const {env,db}=await seeded();
 // Sin CI de TPV todavía: no está en el inventario y se propone el alta prefijada (Xpacio, categoría y nombre del propio id).
 let r=await resolveEquipo(env,{ref:TPV_REF,loc:'Starbucks Alsea · Paseo de Gracia 103'},NOW);
 assert.equal(r.found,false);assert.equal(r.reason,'no_inventariado');assert.equal(r.xpacio.admira_store_id,'alsea-sbux-021');
 assert.deepEqual(r.create,{admira_store_id:'alsea-sbux-021',site_id:r.xpacio.site_id,category:'tpv',name:'TPV'});
 const tpv=await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-TPV-01',name:'TPV caja',category:'tpv',lifecycle:{manufacturer:'Marca P',model:'Modelo P',serial:'SN-PRUEBA-1',supplier:'Proveedor P',purchase_date:'2026-02-01',warranty_start:'2026-02-01',warranty_end:'2028-02-01'}});
 assert.equal(tpv.status,200);
 r=await resolveEquipo(env,{ref:TPV_REF},NOW);
 assert.equal(r.found,true);assert.equal(r.match,'categoria');assert.equal(r.ci.itil_code,'PDG103-TPV-01');assert.equal(r.ci.lifecycle.serial,'SN-PRUEBA-1');assert.equal(r.ci.lifecycle.warranty,'valid');
 assert.equal(r.xpacio.name,'Starbucks Paseo de Gracia');assert.equal(r.xpacio.admira_store_id,'alsea-sbux-021');
 // Por código ITIL directo (y por el parámetro code).
 assert.equal((await resolveEquipo(env,{ref:'PDG103-TPV-01'},NOW)).match,'itil_code');assert.equal((await resolveEquipo(env,{code:'PDG103-TPV-01',ref:'otra-cosa'},NOW)).match,'itil_code');
 // Por id del equipo y por incidencia del Portal.
 assert.equal((await resolveEquipo(env,{ref:tpv.body.device_id},NOW)).match,'device');
 db.prepare("INSERT INTO installer_incidents(id,device_id,title,reason,status,created_at) VALUES('inc-p1',?,'TPV bloqueado','retailer','open',1)").run(tpv.body.device_id);
 assert.equal((await resolveEquipo(env,{ref:'portal:inc-p1',portal_incident:'inc-p1'},NOW)).match,'portal');
 // Varias pantallas ITIL y ninguna se llama «Pantalla 4»: 'pantalla-4' es ambiguo → candidatos, nunca se elige una al azar.
 for(const [code,name] of [['PDG103-PAN-01','Menu board'],['PDG103-PAN-02','Recogida']])await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:code,name,category:'pantalla'});
 // «Pantalla 3» con ese nombre exacto (como en el Xpacio real) → casa por nombre.
 await fleet(env,'/ci/upsert',{admira_store_id:'alsea-sbux-021',itil_code:'PDG103-PAN-03',name:'Pantalla 3',category:'pantalla'});
 r=await resolveEquipo(env,{ref:'demo:starbucks-alsea-paseo-de-gracia:pantalla-3:manual:abc'},NOW);
 assert.equal(r.found,true);assert.equal(r.match,'nombre');assert.equal(r.ci.itil_code,'PDG103-PAN-03');
 r=await resolveEquipo(env,{ref:'demo:starbucks-alsea-paseo-de-gracia:pantalla-4'},NOW);
 assert.equal(r.found,false);assert.equal(r.reason,'ambiguo');assert.deepEqual(r.candidates.map(c=>c.itil_code),['PDG103-PAN-01','PDG103-PAN-02','PDG103-PAN-03']);
 // Un equipo del catálogo (sin ficha ITIL) que coincide por superficie → «sin ficha», con alta por adopción.
 const {env:env2}=await seeded();
 r=await resolveEquipo(env2,{ref:'alsea-sbux-021:pantalla-recogida'},NOW);
 assert.equal(r.found,true,'el catálogo siembra ficha provisional');assert.equal(r.ci.managed_by,'catalogo');
 // Xpacio desconocido / referencia sin forma.
 assert.equal((await resolveEquipo(env,{ref:'demo:otro-gemelo:tpv'},NOW)).reason,'xpacio_no_encontrado');
 assert.equal((await resolveEquipo(env,{ref:'pantalla-suelta'},NOW)).reason,'sin_referencia');
 // Ruta interna: solo por binding.
 const via=await handleItilInternal(new Request('https://yokup-api.internal/internal/itil/equipo?ref='+encodeURIComponent(TPV_REF)),env);
 const body=await via.json();assert.equal(via.status,200);assert.equal(body.found,true);assert.equal(body.ci.itil_code,'PDG103-TPV-01');
 const pub=await handleItilInternal(new Request('https://yokup-api.internal/internal/itil/equipo?ref=x',{headers:{'cf-connecting-ip':'1.2.3.4'}}),env);assert.equal(pub.status,404);
 const other=await handleItilInternal(new Request('https://data.yokup.com/internal/itil/equipo?ref=x'),env);assert.equal(other.status,404);
});
