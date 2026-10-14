#!/usr/bin/env node
// DEMO DEL FILTRO POR PROYECTO (encargo #5980) · sin login, sin red propia, sin tocar producción.
// Arranca la API real de Yokup (api/src) sobre una D1 en memoria (la misma de las pruebas) y sirve el
// yokup-site de este checkout en http://localhost:8788. Dos sesiones de
// prueba, creadas aquí y que solo existen en la memoria de este proceso:
//   /demo/superusuario → superusuario de prueba con «Abrir como retailer» en la cuenta de marca Alsea
//   /demo/comercio     → comercio normal (no superusuario) que intenta ?proyecto=starbucks
// El navegador nunca recibe una cookie de sesión: la elige el servidor de demo por la cookie yk_demo y se la
// pone a cada llamada /api/*. Datos de prueba: Starbucks Paseo de Gracia (alsea-sbux-021) y Starbucks Tijuana
// (alsea-mx-sbux-01-tijuana), una incidencia abierta en cada uno, más el estanco del comercio normal.
//   node api/tools/demo-proyecto.mjs [--port 8788]
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setup} from '../test-fixture.mjs';
import {handleRetailer} from '../src/retailer-portal.js';
import {handleAdmin} from '../src/portal-admin.js';
import {hash} from '../src/installer-portal.js';
import {syncXpacios} from '../src/admira-xpacio-sync.js';

const PORT=Number(process.argv[process.argv.indexOf('--port')+1])||8788;
const ORIGIN='http://localhost:'+PORT;
const PAGE='https://www.yokup.com';      // el origen que ve la API: el de la página real
const SITE=fileURLToPath(new URL('../../yokup-site/',import.meta.url));
const SUPERUSUARIO='csilva@admira.com';   // está en la lista de superusuarios de la API; la sesión es de prueba

const surfaces=names=>names.map(([name,surface])=>({name,desc:'',status:'sched',surface}));
const CATALOGO=[
 {id:'alsea-sbux-021',name:'Starbucks Paseo de Gracia',kind:'Cafetería · Starbucks · Circuito DOOH Alsea',addr:'Paseo de Gracia 103 · Barcelona · 08008',coords:[2.15979,41.39574],city:'Barcelona',circuit:'alsea_starbucks',external:{brand:'Starbucks',operator:'Alsea',storeId:'67943-302838'},twin:'https://www.xpaceos.com/admira-xp/?autostart=cafeteria&loc=alsea-sbux-021',surfaces:surfaces([['Menu board digital','pantalla'],['Pantalla recogida','pantalla'],['Escaparate','escaparate']])},
 {id:'alsea-mx-sbux-01-tijuana',name:'Starbucks Tijuana · Plaza Río',kind:'Cafetería · Starbucks · Alsea México',addr:'Avenida Paseo de los Héroes 95 · Tijuana · 22010 · México',coords:[-117.018754,32.527349],city:'Tijuana',circuit:'alsea_mexico',external:{brand:'Starbucks',operator:'Alsea'},twin:'https://www.xpaceos.com/admira-xp/?loc=alsea-mx-sbux-01-tijuana',surfaces:surfaces([['Menu board digital','pantalla'],['Pantalla recogida','pantalla']])},
 {id:'jti-xtanco-001',name:'Estanco Juan Florez',kind:'Estanco · Xtanco · Circuito DOOH JTI',addr:'Rúa Juan Flórez 40 · A Coruña · 15004',coords:[-8.408523,43.365151],city:'A Coruña',circuit:'jti_xtanco',external:{brand:'Xtanco',sponsor:'JTI'},twin:'https://www.xpaceos.com/admira-xp/?loc=jti-xtanco-001',surfaces:surfaces([['LED Frontal','pantalla']])},
];

const {db,env}=setup();
const cookieOf=r=>r.headers.get('set-cookie')?.split(';')[0];
async function api(handler,base,path,body,cookie){
 const r=await handler(new Request('https://data.yokup.com/api/'+base+path,{method:body?'POST':'GET',headers:{Origin:PAGE,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined}),env);
 const out={status:r.status,body:await r.json(),cookie:cookieOf(r)};
 if(r.status>=400)throw new Error(base+path+' → '+r.status+' '+JSON.stringify(out.body));
 return out;
}
const retail=(path,body,cookie)=>api(handleRetailer,'retailer',path,body,cookie);

// ─── Datos de prueba ───
await syncXpacios(env,{fetcher:async()=>new Response(JSON.stringify({locations:CATALOGO,updatedAt:1,source:'kv'})),force:true});
const adminToken=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
db.prepare('INSERT INTO portal_admin_sessions VALUES(?,?,?,?)').run(await hash(adminToken),SUPERUSUARIO,'demo-sin-google',Date.now()+86400000);
const adminCookie='__Host-yk_portal_admin='+adminToken;
const alsea=db.prepare("SELECT retailer_id FROM brand_accounts WHERE brand_key='alsea'").get().retailer_id;
const su=await retail('/switch',{retailer_id:alsea},adminCookie);
const todo=(await retail('/dashboard',undefined,su.cookie)).body;
for(const site of todo.sites){
 const device=todo.devices.find(d=>d.site_id===site.id);
 await retail('/incidents',{device_id:device.id,title:'No arranca el menu board',description:'La pantalla del mostrador no enciende desde la apertura.',priority:'urgent',request_key:crypto.randomUUID()},su.cookie);
}
const shop=await retail('/register',{name:'Estanco La Rambla',email:'demo-comercio@example.test',password:'demo-comercio-sin-uso'});
const local=await retail('/sites',{name:'Estanco La Rambla',kind:'tobacco',country:'ES',city:'Barcelona',address:'La Rambla 1',latitude:41.38,longitude:2.17},shop.cookie);
await retail('/devices',{site_id:local.body.id,name:'Pantalla escaparate',skill:'screen'},shop.cookie);

// Tarro de cookies por rol: lo que la API fija (p. ej. al salir) se queda aquí, nunca en el navegador.
const JARS={superusuario:{admin:adminCookie,retail:su.cookie},comercio:{retail:shop.cookie}};
const ROLE_RE=/(?:^|;\s*)yk_demo=(superusuario|comercio)/;

// ─── Servidor ───
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2'};
const LANDING=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo · filtro por proyecto (#5980)</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px}a{display:block;margin:12px 0;font-weight:700}code{background:#f1f1f1;padding:1px 4px;border-radius:4px}</style>
<h1>Filtro por proyecto · demo local</h1><p>API real de Yokup en memoria, datos de prueba, sin login. Nada sale de este equipo salvo los estilos de marca y la consola ⌘ Experto (admiranext.com).</p>
<a href="/demo/superusuario">1 · Superusuario en la cuenta Alsea (sin filtro)</a>
<a href="/demo/superusuario?proyecto=starbucks">2 · Superusuario con <code>?proyecto=starbucks</code></a>
<a href="/demo/superusuario?proyecto=starbucks&amp;marca=starbucks">3 · Igual, con <code>/marca starbucks</code></a>
<a href="/demo/comercio?proyecto=starbucks">4 · Comercio normal que pide <code>?proyecto=starbucks</code> (403)</a>
<p>En el portal, ⌘ Experto (abajo) admite <code>/proyecto starbucks</code>, <code>/proyecto off</code> y <code>/marca starbucks</code>.</p></html>`;

async function proxy(req,res,url){
 const role=(req.headers.cookie||'').match(ROLE_RE)?.[1];
 const jar=JARS[role];
 if(!jar){res.writeHead(401,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Abre /demo/superusuario o /demo/comercio primero.'}));}
 const chunks=[];for await(const c of req)chunks.push(c);
 const handler=url.pathname.startsWith('/api/portal-admin/')?handleAdmin:url.pathname.startsWith('/api/retailer/')?handleRetailer:null;
 if(!handler){res.writeHead(404,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'No disponible en la demo.'}));}
 const cookie=Object.values(jar).filter(Boolean).join('; ');
 const r=await handler(new Request('https://data.yokup.com'+url.pathname+url.search,{method:req.method,headers:{Origin:PAGE,'Content-Type':req.headers['content-type']||'application/json',...(cookie?{Cookie:cookie}:{})},body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),env);
 const set=r.headers.get('set-cookie');
 if(set){const [pair]=set.split(';'),[name,value]=pair.split('=');const key=name.includes('admin')?'admin':'retail';jar[key]=value?pair:'';}
 res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/json','Cache-Control':'no-store'});
 res.end(Buffer.from(await r.arrayBuffer()));
}

async function file(res,pathname){
 let rel=normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/,'');
 if(rel.endsWith('/'))rel+='index.html';
 let path=join(SITE,rel);
 const exists=async p=>{try{return (await stat(p)).isFile();}catch{return false;}};
 if(!path.startsWith(SITE))return false;
 if(!await exists(path)){if(await exists(path+'.html'))path+='.html';else return false;}
 const type=TYPES[extname(path)]||'application/octet-stream';
 let body=await readFile(path);
 // La página habla con data.yokup.com; en la demo, con este mismo servidor.
 if(/\.(m?js|html)$/.test(path))body=Buffer.from(body.toString('utf8').replaceAll('https://data.yokup.com/api','/api'));
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);return true;
}

createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,ORIGIN);
  const demo=url.pathname.match(/^\/demo\/(superusuario|comercio)\/?$/);
  if(demo){
   const q=new URLSearchParams(url.search);
   res.writeHead(302,{'Set-Cookie':'yk_demo='+demo[1]+'; Path=/; SameSite=Lax','Location':'/retailer'+(q.size?'?'+q:'')});return res.end();
  }
  if(url.pathname==='/'||url.pathname==='/demo'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(LANDING);}
  if(url.pathname.startsWith('/api/'))return await proxy(req,res,url);
  if(await file(res,url.pathname))return;
  res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('No encontrado');
 }catch(e){console.error(e);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:String(e.message||e)}));}
}).listen(PORT,'127.0.0.1',()=>console.log('Demo #5980 lista: '+ORIGIN+'/  (superusuario: '+ORIGIN+'/demo/superusuario · comercio: '+ORIGIN+'/demo/comercio)'));
