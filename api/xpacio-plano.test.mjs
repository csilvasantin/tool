import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import worker from './src/index.js';
import {setup} from './test-fixture.mjs';
import {handleRetailer} from './src/retailer-portal.js';
import {hash} from './src/installer-portal.js';
import {syncXpacios} from './src/admira-xpacio-sync.js';
import {handleItilInternal} from './src/itil.js';
import {handlePlanoInternal} from './src/xpacio-plano.js';
import {validatePlan,planHash,canonicalJson,crossCheck,publicPlan,PLANO_MAX_BYTES} from './src/xpacio-plano-model.js';

// Plano maestro del Xpacio en Yokup (DCL-fbee86b0016fa4cef7a7726c · Hoy #186). Ver docs/plano-yokup.md.
const ORIGIN='https://www.yokup.com';
const walls=[{id:'F',nombre:'Ventana',a:[0,0],b:[4,0]},{id:'D',a:[4,0],b:[4,3]},{id:'P',a:[4,3],b:[0,3]},{id:'I',a:[0,3],b:[0,0]}];
const screen=(id,itil,extra={})=>({id,itil,nombre:'Pantalla '+id,orientacion:'vertical',pulgadas:27,resolucion:[1440,2560],pared:'F',s:1,z:0.8,...extra});
// Como lab-gran-de-gracia-51.json de clearchannel-tv: establecimiento propio de Yokup, sin admira_store_id.
const labPlan=(extra={})=>({schema:'admira.xpacio-plano/1',id:'lab-gran-de-gracia-51',version:'2026-10-14-camara-2',nombre:'Laboratorio AdmiraNeXT',
 direccion:'Carrer Gran de Gràcia 51 · 08012 Barcelona',fuente:{titulo:'Levantamiento por cámara'},planta:{ancho:4,fondo:3,alto:3.1},criterios:{alturaMinima:0.8},paredes:walls,
 huecos:[{id:'pasillo',tipo:'puerta',pared:'D',desde:1,ancho:0.85,base:0,alto:2.3}],mobiliario:[{id:'mesa',nombre:'Mesa',x:0.9,y:0,w:1.75,d:0.7,alto:0.75}],
 contenidos:{instalacion:'starbucks-six'},dispositivos:[{id:'macmini',nombre:'Mac mini',categoria:'player',pared:'F',fleet:'MacMini',itil:'GDG51-PLY-01'},{id:'webcam',categoria:'iot',pared:'F',s:1.75,z:1.25,itil:null}],
 pantallas:[screen('v1','GDG51-PAN-01',{s:0.8}),screen('h1','GDG51-PAN-02',{s:1.5,orientacion:'horizontal',resolucion:[2560,1440]}),screen('v2',null,{s:2.2})],...extra});
// Como alsea-sbux-021.json: Xpacio del catálogo (id = admira_store_id), pantallas aún sin código ITIL.
const sbuxPlan=(extra={})=>({...labPlan(),id:'alsea-sbux-021',version:'2026-10-14-esquematico-1',nombre:'Starbucks Paseo de Gracia 103',dispositivos:undefined,
 pantallas:[screen('v1',null,{s:1}),screen('v2',null,{s:2})],...extra});
const surfaces=names=>names.map(([name,surface])=>({name,desc:'',status:'sched',surface}));
const sbux={id:'alsea-sbux-021',name:'Starbucks Paseo de Gracia',kind:'Cafetería · Starbucks',addr:'Paseo de Gracia 103 · Barcelona · 08008',coords:[2.15979,41.39574],city:'Barcelona',circuit:'alsea_starbucks',external:{brand:'Starbucks',operator:'Alsea'},twin:'https://www.xpaceos.com/admira-xp/?loc=alsea-sbux-021',surfaces:surfaces([['Menu board digital','pantalla'],['Escaparate','escaparate']])};
const count=(db,sql,...a)=>db.prepare(sql).get(...a).n;
async function retail(env,path,body,cookie,method=body?'POST':'GET'){
 const r=await handleRetailer(new Request('https://data.yokup.com/api/retailer'+path,{method,headers:{Origin:ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
const put=(env,body,cookie)=>retail(env,'/plano',body,cookie,'PUT');
async function shop(env){const a=await retail(env,'/register',{name:'Comercio',email:crypto.randomUUID()+'@example.test',password:'retailer-test-password'});const site=await retail(env,'/sites',{name:'Laboratorio GdG 51',kind:'other',country:'ES',city:'Barcelona',address:'Carrer Gran de Gràcia 51',latitude:41.4,longitude:2.15},a.cookie);return {cookie:a.cookie,id:a.body.profile.id,site:site.body.id};}
// Sesión delegada de un miembro (viewer | manager) sobre la cuenta, como la que abre /switch.
async function member(db,retailerId,role){
 const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),email=role+'-'+crypto.randomUUID().slice(0,8)+'@example.test',h=await hash(token);
 db.prepare('INSERT INTO retailer_sessions VALUES(?,?,?)').run(h,retailerId,Date.now()+3600000);
 db.prepare('INSERT INTO retailer_session_actors VALUES(?,?,?,?,?)').run(h,email,'member',null,Date.now());
 db.prepare('INSERT INTO retailer_account_members VALUES(?,?,?,?,?,NULL)').run(retailerId,email,role,'test',Date.now());
 return {cookie:'__Host-yk_retailer='+token,email};
}
const internal=(path,body,{host='yokup-api.internal',headers={}}={})=>new Request('https://'+host+'/internal/plano'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
const fleet=async(env,path,body)=>{const r=await handlePlanoInternal(internal(path,body&&{actor:'OraculoMacMini',machine:'MacMini',...body}),env);return {status:r.status,body:await r.json()};};
const itilFleet=(env,body)=>handleItilInternal(new Request('https://yokup-api.internal/internal/itil/ci/upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor:'OraculoMacMini',machine:'MacMini',...body})}),env);
async function readKey(db,{solution='xpaceos',origins=[],brands=null}={}){const key='yki_'+(crypto.randomUUID()+crypto.randomUUID()).replaceAll('-','').slice(0,64);db.prepare('INSERT INTO itil_read_keys(id,solution,key_hash,origins,brands,created_at) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),solution,await hash(key),JSON.stringify(origins),brands&&JSON.stringify(brands),Date.now());return key;}
const galaxy=(env,id,headers={},method='GET')=>worker.fetch(new Request('https://data.yokup.com/api/plano/xpacios/'+id,{method,headers}),env,{waitUntil(){}});
async function labWithItil(){
 const h=setup(),a=await shop(h.env);
 for(const [itil_code,category] of [['GDG51-PAN-01','pantalla'],['GDG51-PAN-02','pantalla'],['GDG51-PAN-03','pantalla'],['GDG51-PLY-01','player']])
  assert.equal((await retail(h.env,'/itil/cis',{site_id:a.site,itil_code,name:'CI '+itil_code,category},a.cookie)).status,201);
 return {...h,a};
}

test('validación estructural: acepta los planos de ejemplo y rechaza esquema, sala, paredes, pantallas e itil mal formados',()=>{
 for(const p of [labPlan(),sbuxPlan()]){const v=validatePlan(p);assert.equal(v.ok,true,JSON.stringify(v.errors));}
 assert.deepEqual(validatePlan(labPlan()).summary,{walls:4,screens:3,devices:2});
 const bad=(p,re)=>{const v=validatePlan(p);assert.equal(v.ok,false,JSON.stringify(p).slice(0,80));assert.ok(v.errors.some(e=>re.test(e)),v.errors.join(' | '));};
 bad({...labPlan(),schema:'admira.orden-obra/1'},/esquema/);bad([],/objeto/);bad(null,/objeto/);
 bad({...labPlan(),id:'con espacio'},/«id»/);bad({...labPlan(),version:''},/version/);bad({...labPlan(),version:undefined},/version/);
 bad({...labPlan(),planta:{ancho:4,fondo:3}},/planta/);bad({...labPlan(),planta:{ancho:900,fondo:3,alto:3}},/planta/);
 bad({...labPlan(),paredes:walls.slice(0,2)},/paredes/);bad({...labPlan(),paredes:[...walls.slice(0,3),{id:'F',a:[0,0],b:[1,1]}]},/repetido/);
 bad({...labPlan(),paredes:[...walls.slice(0,3),{id:'X',a:[0,'3'],b:[0,0]}]},/extremos a y b/);bad({...labPlan(),paredes:[...walls.slice(0,3),{id:'X',a:[0,0],b:[0,0.01]}]},/5 cm/);
 bad({...labPlan(),pantallas:[screen('v1',null,{pared:'Z'})]},/pared que no existe/);
 bad({...labPlan(),pantallas:[screen('v1',null,{orientacion:'diagonal'})]},/orientacion/);
 bad({...labPlan(),pantallas:[screen('v1',null,{pulgadas:0})]},/pulgadas/);
 bad({...labPlan(),pantallas:[screen('v1',null,{s:'1'})]},/«s»/);
 bad({...labPlan(),pantallas:[screen('v1',null),screen('v1',null)]},/repetido/);
 bad({...labPlan(),pantallas:[screen('v1','gdg51-pan-01')]},/itil/);
 bad({...labPlan(),pantallas:[screen('v1',null,{resolucion:[1920]})]},/resolucion/);
 bad({...labPlan(),dispositivos:[{id:'p',pared:'Z'}]},/pared que no existe/);
 bad({...labPlan(),huecos:[{id:'h',pared:'F',desde:1,ancho:'x',alto:2}]},/hueco/);
 bad({...labPlan(),mobiliario:[{id:'m',x:0,y:0,w:1,d:1}]},/mueble/);
 bad({...labPlan(),yokup:'x'},/yokup/);
 bad(JSON.parse('{"schema":"admira.xpacio-plano/1","id":"x","version":"1","planta":{"ancho":1e400,"fondo":1,"alto":1}}'),/no finito/);
 bad({...labPlan(),fuente:{titulo:'con \u0007 control'}},/control/);
 let deep={};for(let i=0;i<20;i++)deep={x:deep};bad({...labPlan(),extra:deep},/anida/);
 const big=validatePlan({...labPlan(),fuente:{notas:Array.from({length:80},()=>'x'.repeat(3500))}});assert.equal(big.ok,false);assert.equal(big.too_large,true);assert.ok(big.bytes>PLANO_MAX_BYTES);
});

test('hash del JSON canónico: otro orden de claves o sangría da el mismo sha256; cualquier cambio, otro',async()=>{
 const p=labPlan(),reordered=JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(p).reverse())));
 assert.equal(await planHash(p),await planHash(reordered));assert.match(await planHash(p),/^[a-f0-9]{64}$/);
 assert.notEqual(await planHash(p),await planHash({...p,version:'otra'}));
 assert.equal(canonicalJson({b:1,a:[{d:2,c:null}]}),'{"a":[{"c":null,"d":2}],"b":1}');
});

test('cruce con el ITIL: solo avisos (código ajeno, retirado, categoría, repetido, pantallas del inventario fuera del plano, provisionales y pendientes)',()=>{
 const cis=[{itil_code:'GDG51-PAN-01',category:'pantalla',status:'operational',name:'V1'},{itil_code:'GDG51-PAN-02',category:'player',status:'operational',name:'H1'},{itil_code:'GDG51-PAN-03',category:'pantalla',status:'operational',name:'Sin plano'},
  {itil_code:'GDG51-PAN-04',category:'pantalla',status:'retired',name:'Retirada'},{itil_code:'GDG51-PLY-01',category:'player',status:'operational',name:'Mac mini'},{itil_code:null,category:'pantalla',status:'operational',name:'Provisional'}];
 const plan=labPlan({pantallas:[screen('v1','GDG51-PAN-01'),screen('h1','GDG51-PAN-02'),screen('v2','GDG51-PAN-01'),screen('v3','NOPE-01'),screen('v4','GDG51-PAN-04'),screen('v5',null)]});
 const c=crossCheck(plan,cis),codes=c.warnings.map(w=>w.code+':'+(w.itil||w.count));
 assert.deepEqual(codes.sort(),['catalog_screens:1','ci_screen_missing:GDG51-PAN-03','itil_category:GDG51-PAN-02','itil_duplicated:GDG51-PAN-01','itil_not_found:NOPE-01','itil_pending:1','itil_retired:GDG51-PAN-04'].sort());
 assert.equal(c.linked,4);assert.equal(c.cis,5);
 assert.deepEqual(crossCheck({pantallas:[]},[]),{cis:0,linked:0,warnings:[]});
 assert.equal(crossCheck(labPlan({dispositivos:[{id:'p',categoria:'player',itil:'GDG51-PAN-01'}],pantallas:[]}),cis).warnings.find(w=>w.code==='itil_category').itil,'GDG51-PAN-01','un dispositivo player que apunta a una pantalla');
});

test('Galaxia: publicPlan es lista blanca del esquema; los campos hostiles o con otro tipo no viajan, a ninguna profundidad',()=>{
 const hostile={contact_email:'pepe@cliente.test',telefono_movil:'+34600111222',street:'Calle Secreta 7',postal_code:'08012',mac_address:'AA:BB:CC:DD:EE:FF',ip_address:'10.0.0.7',
  serial_number:'SN-HOSTIL-1',numero_de_serie:'NS-HOSTIL-2',geo:{lat:41.4,lng:2.15},location:'41.40,2.15',nif:'B12345678'};
 const plan=labPlan({...hostile,yokup:{site_id:'4723419e-5bf2-4f7c-b5d2-b87171503754',portal:'https://admira.app/retailer#itil',cis:11,owner_email:'dueño@cliente.test'},
  planta:{ancho:4,fondo:3,alto:3.1,...hostile},fuente:{titulo:'Levantamiento',contacto:'pepe@cliente.test'},contenidos:{instalacion:'starbucks-six',token:'secreto-contenidos'},
  paredes:walls.map(w=>({...w,...hostile})),huecos:[{id:'h',tipo:'puerta',pared:'D',desde:1,ancho:0.9,alto:2.2,...hostile}],mobiliario:[{id:'m',x:0,y:0,w:1,d:1,alto:1,...hostile}],
  pantallas:[screen('v1','GDG51-PAN-01',{...hostile,compra:{fecha:'2026-01-01',proveedor:'X'},Modelo:'QM55',nombre:{email:'pepe@cliente.test'},resolucion:undefined,dimensiones:{ancho:1,alto:1,serial:'SN-DIM'}})],
  dispositivos:[{id:'macmini',nombre:'Mac mini',categoria:'player',pared:'F',fleet:'MacMini',itil:'GDG51-PLY-01',...hostile}]});
 assert.equal(validatePlan(plan).ok,true,'el plano con campos de más es válido: se guarda entero y solo se filtra al publicarlo');
 const p=publicPlan(plan),raw=JSON.stringify(p);
 for(const secret of ['pepe@cliente','dueño@','+34600','Calle Secreta','08012','AA:BB','10.0.0.7','SN-','NS-HOSTIL','41.4','B12345678','4723419e','admira.app/retailer','MacMini','QM55','2026-01-01','secreto-contenidos','Gran de Gràcia 51 · 08012'])
  assert.ok(!raw.includes(secret),'no expone '+secret);
 for(const k of [...Object.keys(hostile),'direccion','fleet','compra','Modelo','site_id','portal','owner_email','contacto','token'])assert.ok(!raw.includes('"'+k+'"'),'sin la clave '+k);
 assert.deepEqual(Object.keys(p).sort(),['contenidos','criterios','dispositivos','fuente','huecos','id','mobiliario','nombre','pantallas','paredes','planta','schema','version','yokup']);
 assert.deepEqual(p.yokup,{cis:11});assert.deepEqual(p.planta,{ancho:4,fondo:3,alto:3.1});assert.deepEqual(p.paredes[0],{id:'F',nombre:'Ventana',a:[0,0],b:[4,0]});
 assert.deepEqual(p.pantallas[0],{id:'v1',itil:'GDG51-PAN-01',orientacion:'vertical',pulgadas:27,dimensiones:{ancho:1,alto:1},pared:'F',s:1,z:0.8},'nombre y resolución con otro tipo no viajan');
 assert.deepEqual(p.dispositivos[0],{id:'macmini',nombre:'Mac mini',categoria:'player',pared:'F',itil:'GDG51-PLY-01'});
 // Un campo conocido con otro tipo tampoco viaja (aunque la validación ya lo habría rechazado al guardar).
 assert.equal(publicPlan({pantallas:[{id:'x',resolucion:['pepe@cliente.test',1],s:'1'}]}).pantallas[0].resolucion,undefined);
 assert.deepEqual(publicPlan(null),{});assert.deepEqual(publicPlan(labPlan({pantallas:[screen('v2',null)]})).pantallas[0].itil,null);
});

test('migración 0024: aditiva, idempotente y el histórico es append-only (ni UPDATE ni DELETE; el vigente no se borra)',async()=>{
 const {db,env}=setup(),a=await shop(env);const sql=readFileSync(new URL('./migrations/0024_xpacio_plano.sql',import.meta.url),'utf8');db.exec(sql);db.exec(sql);
 assert.equal((await put(env,{site_id:a.site,plan:labPlan()},a.cookie)).status,201);
 assert.throws(()=>db.prepare("UPDATE xpacio_plano_versions SET version='x'").run(),/append-only/);
 assert.throws(()=>db.prepare('DELETE FROM xpacio_plano_versions').run(),/append-only/);
 assert.throws(()=>db.prepare('DELETE FROM xpacio_planos').run(),/no se borra/);
 assert.throws(()=>db.prepare("INSERT INTO xpacio_planos(site_id,plan_id,schema,version,plan_json,sha256,seq,screens,bytes,source,created_by,created_at,updated_by,updated_at) VALUES('s','p','otro/1','v','{}','h',1,0,2,'portal','t',1,'t',1)").run(),/CHECK/);
 // La comprobación del despliegue: 3 tablas, 2 índices y 3 triggers con prefijo xpacio_plano; el laboratorio, permitido una sola vez.
 const objects=db.prepare("SELECT type,COUNT(*) n FROM sqlite_master WHERE name LIKE 'xpacio_plano%' GROUP BY type ORDER BY type").all().map(r=>[r.type,r.n]);
 assert.deepEqual(objects,[['index',2],['table',3],['trigger',3]]);
 assert.deepEqual(db.prepare('SELECT site_id,revoked_at FROM xpacio_plano_fleet_sites').all().map(r=>[r.site_id,r.revoked_at]),[['4723419e-5bf2-4f7c-b5d2-b87171503754',null]]);
});

test('portal: el titular guarda; repetir (aunque cambie el orden de claves) no escribe; cada versión distinta va al histórico; volver atrás es versión nueva',async()=>{
 const {env,db,a}=await labWithItil();
 const first=await put(env,{site_id:a.site,plan:labPlan({yokup:{site_id:a.site,cis:4}})},a.cookie);
 assert.equal(first.status,201,JSON.stringify(first.body));assert.equal(first.body.created,true);assert.equal(first.body.changed,true);assert.equal(first.body.seq,1);assert.equal(first.body.previous_sha256,null);
 assert.equal(first.body.admira_store_id,null);assert.equal(first.body.screens,3);
 assert.deepEqual(first.body.itil_check.warnings.map(w=>w.code).sort(),['ci_screen_missing','itil_pending']);assert.equal(first.body.itil_check.linked,3);
 const audits=count(db,"SELECT COUNT(*) n FROM itil_audit WHERE action='plan-update'");assert.equal(audits,1);
 const audit=db.prepare("SELECT * FROM itil_audit WHERE action='plan-update'").get();assert.equal(audit.channel,'portal');assert.equal(audit.site_id,a.site);assert.match(audit.detail,/Primer plano · 2026-10-14-camara-2 · 3 pantallas/);
 // Mismo JSON, otro orden de claves: changed:false, ni versión ni auditoría.
 const reordered=Object.fromEntries(Object.entries(labPlan({yokup:{site_id:a.site,cis:4}})).reverse());
 const again=await put(env,{site_id:a.site,plan:reordered},a.cookie);assert.equal(again.status,200);assert.equal(again.body.changed,false);assert.equal(again.body.sha256,first.body.sha256);
 assert.equal(count(db,'SELECT COUNT(*) n FROM xpacio_plano_versions'),1);assert.equal(count(db,"SELECT COUNT(*) n FROM itil_audit WHERE action='plan-update'"),1);
 // Nueva versión: seq 2, previous_sha256 y el histórico la lista primero.
 const v2=await put(env,{site_id:a.site,plan:labPlan({version:'2026-10-15-metro-1',yokup:{site_id:a.site}})},a.cookie);
 assert.equal(v2.status,200);assert.equal(v2.body.changed,true);assert.equal(v2.body.created,false);assert.equal(v2.body.seq,2);assert.equal(v2.body.previous_sha256,first.body.sha256);
 // Volver al primero: es una versión NUEVA (seq 3), nada se reescribe.
 const back=await put(env,{site_id:a.site,plan:labPlan({yokup:{site_id:a.site,cis:4}})},a.cookie);assert.equal(back.body.seq,3);assert.equal(back.body.sha256,first.body.sha256);
 const got=await retail(env,'/plano?site_id='+a.site,undefined,a.cookie);
 assert.equal(got.status,200);assert.equal(got.body.has_plan,true);assert.equal(got.body.current.seq,3);assert.equal(got.body.current.created_by,got.body.current.updated_by);assert.equal(got.body.plan.version,'2026-10-14-camara-2');
 assert.deepEqual(got.body.history.map(h=>[h.seq,h.version]),[[3,'2026-10-14-camara-2'],[2,'2026-10-15-metro-1'],[1,'2026-10-14-camara-2']]);
 assert.equal(got.body.plan.direccion,'Carrer Gran de Gràcia 51 · 08012 Barcelona','la vista privada es el plano tal cual');assert.ok(got.body.itil_check);
 const old=await retail(env,'/plano?site_id='+a.site+'&seq=2&history=1',undefined,a.cookie);assert.equal(old.body.plan.version,'2026-10-15-metro-1');assert.equal(old.body.selected.seq,2);assert.equal(old.body.current.seq,3);assert.equal(old.body.history.length,1);
 assert.equal((await retail(env,'/plano?site_id='+a.site+'&seq=9',undefined,a.cookie)).status,404);
 assert.equal((await retail(env,'/plano?site_id='+a.site+'&history=51',undefined,a.cookie)).status,400);
 assert.equal((await retail(env,'/itil',undefined,a.cookie)).body.sites[0].plan_version,'2026-10-14-camara-2');
 // Sin plano: has_plan false.
 const empty=await retail(env,'/sites',{name:'Otro local',kind:'other',country:'ES',city:'Barcelona',address:'Calle sin plano 1',latitude:41.4,longitude:2.15},a.cookie);
 const none=await retail(env,'/plano?site_id='+empty.body.id,undefined,a.cookie);assert.equal(none.body.has_plan,false);assert.equal(none.body.plan,null);assert.deepEqual(none.body.history,[]);
});

test('portal: base_sha256 evita pisar el plano de otro; id o site_id de otro establecimiento, plano inválido (con la lista de errores) y >256 KB se rechazan sin escribir',async()=>{
 const {env,db,a}=await labWithItil();
 assert.equal((await put(env,{site_id:a.site,plan:labPlan(),base_sha256:'a'.repeat(64)},a.cookie)).body.code,'plan_conflict','esperaba un plano que no hay');
 const first=await put(env,{site_id:a.site,plan:labPlan(),base_sha256:''},a.cookie);assert.equal(first.status,201);
 assert.equal((await put(env,{site_id:a.site,plan:labPlan({version:'b'}),base_sha256:null},a.cookie)).status,409);
 // Idempotencia antes que conflicto: si el vigente ya es este plano, changed:false aunque base_sha256 esté desfasado.
 for(const base_sha256 of ['',null,'b'.repeat(64)]){const same=await put(env,{site_id:a.site,plan:labPlan(),base_sha256},a.cookie);assert.equal(same.status,200,String(base_sha256));assert.equal(same.body.changed,false);}
 assert.equal((await put(env,{site_id:a.site,plan:labPlan({version:'b'}),base_sha256:'zz'},a.cookie)).body.code,'invalid_base');
 assert.equal((await put(env,{site_id:a.site,plan:labPlan({version:'b'}),base_sha256:first.body.sha256},a.cookie)).status,200);
 assert.equal((await put(env,{site_id:a.site,plan:labPlan({yokup:{site_id:'otro-establecimiento'}})},a.cookie)).body.code,'plan_site_mismatch');
 const invalid=await put(env,{site_id:a.site,plan:labPlan({paredes:walls.slice(0,2),pantallas:[screen('v1',null,{orientacion:'x'})]})},a.cookie);
 assert.equal(invalid.status,400);assert.equal(invalid.body.code,'invalid_plan');assert.ok(invalid.body.errors.length>=2);assert.match(invalid.body.error,/^Plano no válido: /);
 const huge=await put(env,{site_id:a.site,plan:labPlan({fuente:{notas:Array.from({length:75},()=>'x'.repeat(3600))}})},a.cookie);assert.equal(huge.status,413);assert.equal(huge.body.code,'plan_too_large');
 assert.equal((await put(env,{site_id:a.site,plan:labPlan(),extra:1},a.cookie)).body.code,'unknown_fields');
 assert.equal((await put(env,{plan:labPlan()},a.cookie)).status,400);
 // Un plano de 40 KB pasa (el portal corta los JSON en 16 KB; el plano tiene su propio límite).
 const roomy=labPlan({version:'grande',mobiliario:Array.from({length:300},(_,i)=>({id:'m'+i,nombre:'Mueble de prueba con nombre largo número '+i+' · '+'x'.repeat(60),x:0.1,y:0.1,w:0.5,d:0.5,alto:0.75}))});
 assert.ok(JSON.stringify(roomy).length>40000);assert.equal((await put(env,{site_id:a.site,plan:roomy},a.cookie)).status,200);
 assert.equal(count(db,'SELECT COUNT(*) n FROM xpacio_plano_versions'),3);
});

test('perímetro: titular y manager escriben, viewer solo lee, otro comercio 404, sin sesión 401; Xpacio del catálogo exige su admira_store_id',async()=>{
 const {env,db,a}=await labWithItil(),b=await shop(env);
 const viewer=await member(db,a.id,'viewer'),manager=await member(db,a.id,'manager');
 assert.equal((await put(env,{site_id:a.site,plan:labPlan()},viewer.cookie)).status,403);
 assert.equal(count(db,'SELECT COUNT(*) n FROM xpacio_plano_versions'),0);
 const m=await put(env,{site_id:a.site,plan:labPlan()},manager.cookie);assert.equal(m.status,201);
 assert.equal(db.prepare('SELECT updated_by FROM xpacio_planos WHERE site_id=?').get(a.site).updated_by,manager.email);
 const seen=await retail(env,'/plano?site_id='+a.site,undefined,viewer.cookie);assert.equal(seen.status,200);assert.equal(seen.body.has_plan,true);
 assert.equal((await retail(env,'/plano?site_id='+a.site,undefined,b.cookie)).status,404);
 assert.equal((await put(env,{site_id:a.site,plan:labPlan({version:'robo'})},b.cookie)).status,404);
 assert.equal((await retail(env,'/plano?site_id='+a.site)).status,401);
 assert.equal((await retail(env,'/plano?site_id='+a.site,{},a.cookie,'POST')).status,405);
 // Xpacio del catálogo (cuenta de marca, por «Ver como» de un manager): el id del plano debe ser su admira_store_id.
 await syncXpacios(env,{fetcher:async()=>new Response(JSON.stringify({locations:[sbux]}),{status:200})});
 const alsea=db.prepare("SELECT retailer_id FROM brand_accounts WHERE brand_key='alsea'").get().retailer_id,boss=await member(db,alsea,'manager');
 assert.equal((await put(env,{admira_store_id:'alsea-sbux-021',plan:labPlan()},boss.cookie)).body.code,'plan_id_mismatch');
 const ok=await put(env,{admira_store_id:'alsea-sbux-021',plan:sbuxPlan()},boss.cookie);assert.equal(ok.status,201);assert.equal(ok.body.admira_store_id,'alsea-sbux-021');
 assert.equal(db.prepare("SELECT admira_store_id FROM xpacio_plano_versions WHERE plan_id='alsea-sbux-021'").get().admira_store_id,'alsea-sbux-021');
 // Dos pantallas provisionales del catálogo (sin código) no se pueden cruzar todavía.
 assert.deepEqual(ok.body.itil_check.warnings.map(w=>w.code).sort(),['catalog_screens','itil_pending']);
});

test('MCP de flota /internal/plano/*: solo por binding; Xpacios por admira_store_id y, por site_id, solo los permitidos; sin correos; autor persona · máquina',async()=>{
 const {env,db,a}=await labWithItil();await syncXpacios(env,{fetcher:async()=>new Response(JSON.stringify({locations:[sbux]}),{status:200})});
 const body={admira_store_id:'alsea-sbux-021',plan:sbuxPlan(),actor:'OraculoMacMini',machine:'MacMini'};
 for(const req of [internal('/upsert',body,{host:'data.yokup.com'}),internal('/upsert',body,{headers:{'CF-Connecting-IP':'203.0.113.9'}}),internal('/upsert',body,{headers:{'CF-Ray':'abc-MAD'}}),internal('/get?admira_store_id=alsea-sbux-021',undefined,{host:'yokup-api.workers.dev'})])
  assert.equal((await handlePlanoInternal(req,env)).status,404);
 assert.equal((await worker.fetch(internal('/upsert',body,{host:'data.yokup.com'}),env,{waitUntil(){}})).status,404);
 assert.equal(count(db,'SELECT COUNT(*) n FROM xpacio_planos'),0);
 const noAuthor=await handlePlanoInternal(internal('/upsert',{admira_store_id:'alsea-sbux-021',plan:sbuxPlan()}),env);assert.equal(noAuthor.status,400);assert.equal((await noAuthor.json()).code,'author_required');
 const up=await worker.fetch(internal('/upsert',body),env,{waitUntil(){}});assert.equal(up.status,200);const u=await up.json();assert.equal(u.created,true);assert.equal(u.ok,true);
 assert.equal(db.prepare("SELECT updated_by,source FROM xpacio_planos WHERE admira_store_id='alsea-sbux-021'").get().updated_by,'OraculoMacMini · MacMini');
 assert.equal(db.prepare("SELECT channel FROM itil_audit WHERE action='plan-update'").get().channel,'mcp-flota');
 assert.equal((await fleet(env,'/upsert',{admira_store_id:'alsea-sbux-021',plan:sbuxPlan()})).body.changed,false,'idempotente');
 // Por site_id solo lo permitido: un comercio del portal no es de la flota (igual que si no existiera) hasta que se añade.
 assert.equal((await put(env,{site_id:a.site,plan:labPlan()},a.cookie)).status,201,'el titular guarda desde el portal');
 for(const r of [await fleet(env,'/get?site_id='+a.site),await fleet(env,'/upsert',{site_id:a.site,plan:labPlan({version:'pisado'})}),await fleet(env,'/get?site_id=no-existe')]){assert.equal(r.status,404);assert.equal(r.body.code,'site_not_found');}
 assert.equal(db.prepare('SELECT version FROM xpacio_planos WHERE site_id=?').get(a.site).version,'2026-10-14-camara-2','la flota no lo pisó');
 db.prepare("INSERT INTO xpacio_plano_fleet_sites(site_id,note,granted_by,created_at) VALUES(?,'Laboratorio de prueba','test',?)").run(a.site,Date.now());
 const lab=await fleet(env,'/upsert',{site_id:a.site,plan:labPlan({version:'metro-1'})});assert.equal(lab.status,200);assert.equal(lab.body.admira_store_id,null);assert.equal(lab.body.seq,2);
 const got=await fleet(env,'/get?site_id='+a.site);assert.equal(got.body.ok,true);assert.equal(got.body.plan.id,'lab-gran-de-gracia-51');assert.equal(got.body.current.source,'mcp-flota');
 // Vista de flota sin correos: el titular sale como «titular», el agente con su persona · máquina.
 assert.equal(got.body.current.updated_by,'OraculoMacMini · MacMini');assert.equal(got.body.current.created_by,'titular');
 assert.deepEqual(got.body.history.map(h=>h.updated_by),['OraculoMacMini · MacMini','titular']);assert.doesNotMatch(JSON.stringify({...got.body,plan:null}),/@example\.test/);
 const portal=await retail(env,'/plano?site_id='+a.site,undefined,a.cookie);assert.match(portal.body.current.created_by,/@example\.test$/,'el portal sí ve quién fue');
 db.prepare('UPDATE xpacio_plano_fleet_sites SET revoked_at=? WHERE site_id=?').run(Date.now(),a.site);
 assert.equal((await fleet(env,'/get?site_id='+a.site)).status,404,'revocado, fuera de la flota');
 assert.equal((await fleet(env,'/get?admira_store_id=alsea-sbux-021&history=0')).body.history.length,0);
 assert.equal((await fleet(env,'/upsert',{site_id:a.site,admira_store_id:'alsea-sbux-021',plan:labPlan()})).body.code,'site_required');
 assert.equal((await fleet(env,'/get')).body.code,'site_required');
 assert.equal((await fleet(env,'/upsert',{admira_store_id:'no-existe',plan:sbuxPlan()})).status,404);
 assert.equal((await fleet(env,'/upsert',{site_id:'no-existe',plan:labPlan()})).body.code,'site_not_found');
 const invalid=await fleet(env,'/upsert',{admira_store_id:'alsea-sbux-021',plan:{schema:'otro'}});assert.equal(invalid.status,400);assert.equal(invalid.body.code,'invalid_plan');assert.ok(Array.isArray(invalid.body.errors));
 assert.equal((await fleet(env,'/nope',{admira_store_id:'alsea-sbux-021'})).status,404);
});

test('lectura Galaxia: sin clave lo mínimo; con clave el plano sin datos privados, ETag y cruce; yokup-<site_id> solo publicado o permitido; CORS de las cinco soluciones',async()=>{
 const {env,db,a}=await labWithItil();await syncXpacios(env,{fetcher:async()=>new Response(JSON.stringify({locations:[sbux]}),{status:200})});
 // Xpacio del catálogo sin plano: es público en los mapas, así que el mínimo dice has_plan:false.
 const empty=await (await galaxy(env,'alsea-sbux-021')).json();assert.equal(empty.has_plan,false);assert.equal(empty.access,'public');assert.equal(empty.xpacio.brand,'Alsea');
 await fleet(env,'/upsert',{admira_store_id:'alsea-sbux-021',plan:sbuxPlan({direccion:'Paseo de Gracia 103 · secreta'})});
 const anon=await galaxy(env,'alsea-sbux-021',{Origin:'https://www.admira.biz'}),p=await anon.json();
 assert.equal(anon.status,200);assert.equal(anon.headers.get('Cache-Control'),'public, max-age=60');assert.equal(anon.headers.get('Access-Control-Allow-Origin'),'https://www.admira.biz');assert.match(anon.headers.get('Vary'),/X-Yokup-Itil-Key/);
 assert.deepEqual({access:p.access,schema:p.schema,has_plan:p.has_plan,version:p.version,screens:p.screens,plan_schema:p.plan_schema},{access:'public',schema:'yokup.plano/1',has_plan:true,version:'2026-10-14-esquematico-1',screens:2,plan_schema:'admira.xpacio-plano/1'});
 assert.equal(p.plan,undefined);assert.doesNotMatch(JSON.stringify(p),/paredes|"s":|Paseo de Gracia 103/,'sin clave no hay geometría ni dirección');
 const key=await readKey(db),full=await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':key,Origin:'https://www.admira.store'}),f=await full.json();
 assert.equal(full.status,200);assert.equal(full.headers.get('Cache-Control'),'private, max-age=60');assert.equal(full.headers.get('ETag'),'"'+f.sha256+'"');assert.equal(full.headers.get('Access-Control-Expose-Headers'),'ETag');
 assert.equal(f.access,'key');assert.equal(f.solution,'xpaceos');assert.equal(f.plan.pantallas.length,2);assert.equal(f.plan.paredes.length,4);assert.equal(f.summary.screens,2);assert.ok(Array.isArray(f.itil.warnings));
 const raw=JSON.stringify(f);for(const secret of ['Paseo de Gracia 103 · secreta','OraculoMacMini','updated_by','site_id','41.39'])assert.ok(!raw.includes(secret),'no expone '+secret);
 const cached=await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':key,'If-None-Match':full.headers.get('ETag')});assert.equal(cached.status,304);assert.equal(await cached.text(),'');
 // Propios: yokup-<site_id>. Sin publicar en los mapas, sin clave → 401 (igual si no existe).
 assert.equal((await put(env,{site_id:a.site,plan:labPlan({yokup:{site_id:a.site,cis:4}})},a.cookie)).status,201);
 for(const id of ['yokup-'+a.site,'yokup-no-existe']){const r=await galaxy(env,id);assert.equal(r.status,401);assert.equal((await r.json()).error,'key_required');}
 // Con clave, un comercio del portal sin publicar y no permitido es 404: la clave de una solución no abre cualquier plano.
 const other=await shop(env);assert.equal((await put(env,{site_id:other.site,plan:labPlan({id:'otro-comercio'})},other.cookie)).status,201);
 for(const site of [a.site,other.site])assert.equal((await galaxy(env,'yokup-'+site,{'X-Yokup-Itil-Key':key})).status,404,site);
 db.prepare("INSERT INTO xpacio_plano_fleet_sites(site_id,note,granted_by,created_at) VALUES(?,'Laboratorio de prueba','test',?)").run(a.site,Date.now());
 const lab=await (await galaxy(env,'yokup-'+a.site,{'X-Yokup-Itil-Key':key})).json();
 assert.equal((await galaxy(env,'yokup-'+other.site,{'X-Yokup-Itil-Key':key})).status,404,'el otro comercio sigue fuera');
 assert.equal(lab.access,'key');assert.equal(lab.xpacio.id,'yokup-'+a.site);assert.equal(lab.plan.id,'lab-gran-de-gracia-51');assert.equal(lab.plan.yokup.site_id,undefined,'el id interno no viaja');assert.equal(lab.plan.direccion,undefined);
 assert.equal(lab.itil.linked,3);assert.deepEqual(lab.itil.warnings.map(w=>w.code).sort(),['ci_screen_missing','itil_pending']);
 assert.equal((await galaxy(env,'yokup-no-existe',{'X-Yokup-Itil-Key':key})).status,404);
 // Publicado por su titular en los mapas: mínimo público sin clave y plano con clave, aunque no esté en la lista de la flota.
 assert.equal((await retail(env,'/sites/'+other.site+'/publish',{publish_maps:true},other.cookie)).status,200);
 const pub=await (await galaxy(env,'yokup-'+other.site)).json();assert.equal(pub.access,'public');assert.equal(pub.has_plan,true);assert.equal(pub.screens,3);assert.equal(pub.plan,undefined);
 assert.equal((await (await galaxy(env,'yokup-'+other.site,{'X-Yokup-Itil-Key':key})).json()).plan.id,'otro-comercio');
 // El yokup-* de un Xpacio del catálogo no existe: se lee por su admira_store_id.
 const sbuxSite=db.prepare("SELECT site_id FROM admira_xpacio_sites WHERE admira_store_id='alsea-sbux-021'").get().site_id;
 assert.equal((await galaxy(env,'yokup-'+sbuxSite,{'X-Yokup-Itil-Key':key})).status,404);
 // Clave restringida por marca: fuera de ella (y los propios no tienen marca) 404.
 const jtiOnly=await readKey(db,{solution:'admira-tv',brands:['jti']});
 assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':jtiOnly})).status,404);assert.equal((await galaxy(env,'yokup-'+a.site,{'X-Yokup-Itil-Key':jtiOnly})).status,404);
 assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':'yki_'+'0'.repeat(64)})).status,401);
 const pix=await readKey(db,{solution:'pixeria',origins:['https://www.admira.studio']});
 assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':pix,Origin:'https://www.xpaceos.com'})).status,403);assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':pix,Origin:'https://www.admira.studio'})).status,200);
 // CORS: las cinco soluciones (y sus variantes sin www), también en el ITIL; nada más.
 for(const origin of ['https://www.admira.biz','https://admira.biz','https://www.admira.app','https://www.admira.studio','https://admira.studio','https://www.admira.store','https://admira.store','https://www.admira.tv','https://admira.tv','https://www.xpaceos.com','https://www.pixeria.com','https://www.clearchannel.tv']){
  for(const path of ['/api/plano/xpacios/alsea-sbux-021','/api/itil/xpacios/alsea-sbux-021']){
   const pre=await worker.fetch(new Request('https://data.yokup.com'+path,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'x-yokup-itil-key'}}),env,{waitUntil(){}});
   assert.equal(pre.status,204,origin+path);assert.equal(pre.headers.get('Access-Control-Allow-Origin'),origin);assert.match(pre.headers.get('Access-Control-Allow-Headers'),/X-Yokup-Itil-Key/);assert.equal(pre.headers.get('Access-Control-Allow-Credentials'),null);
  }
 }
 const evil=await galaxy(env,'alsea-sbux-021',{Origin:'https://admira.tv.evil.example','X-Yokup-Itil-Key':key});assert.equal(evil.status,403);assert.equal(evil.headers.get('Access-Control-Allow-Origin'),null);
 assert.equal((await galaxy(env,'alsea-sbux-021',{Origin:'https://www.yokup.com'})).status,403,'solo las soluciones de la Galaxia');
 assert.equal((await galaxy(env,'alsea-sbux-021',{},'PUT')).status,405);
 assert.equal((await galaxy(env,'no-existe')).status,404);
 db.prepare("UPDATE admira_xpacio_sites SET removed_at=1 WHERE admira_store_id='alsea-sbux-021'").run();assert.equal((await galaxy(env,'alsea-sbux-021',{'X-Yokup-Itil-Key':key})).status,404);
});

test('los planos reales de clearchannel-tv validan tal cual (si el repo está en esta máquina)',{skip:!existsSync(new URL('../../repos/clearchannel-tv/data/xpacios/',import.meta.url))},async()=>{
 for(const id of ['alsea-sbux-021','lab-gran-de-gracia-51']){
  const plan=JSON.parse(readFileSync(new URL('../../repos/clearchannel-tv/data/xpacios/'+id+'.json',import.meta.url),'utf8'));
  const v=validatePlan(plan);assert.equal(v.ok,true,id+': '+v.errors.join(' | '));assert.ok(v.bytes<PLANO_MAX_BYTES);
  assert.ok(JSON.stringify(plan.yokup?.site_id?publicPlan(plan):{}).indexOf(plan.yokup?.site_id||'~')<0);
 }
});
