// Local QA only: creates synthetic accounts/jobs in a fresh temporary workerd/D1/R2.
// Never point this harness at a production API. Listener is loopback only.
import http from 'node:http';
import {readFileSync,readdirSync,mkdtempSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const require=createRequire(new URL('../api/package.json',import.meta.url));
const {Miniflare}=require(process.env.MINIFLARE_MODULE||(process.env.QA_NODE_MODULES?join(process.env.QA_NODE_MODULES,'miniflare'):'miniflare'));
const {build}=require(process.env.ESBUILD_MODULE||(process.env.QA_NODE_MODULES?join(process.env.QA_NODE_MODULES,'esbuild'):'esbuild'));
import {account,event,signed} from '../api/test-fixture.mjs';
const root=fileURLToPath(new URL('../api/',import.meta.url));
const storage=mkdtempSync(join(tmpdir(),'installer-mobile-qa-'));
const bundle=await build({stdin:{contents:"import {handleInstaller,dispatchNotifications} from './src/installer-portal.js'; export default {async fetch(request,env){if(new URL(request.url).pathname==='/test/dispatch'){await dispatchNotifications(env);return Response.json({ok:true});}return handleInstaller(request,env);}};",resolveDir:root},bundle:true,format:'esm',target:'es2022',write:false});
const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-07-18',d1Databases:['DB'],r2Buckets:['INSTALLER_EVIDENCE'],resourcePersistencePath:storage,bindings:{INSTALLER_ADMIRA_SECRET:'isolated-test-secret'}});
const db=await mf.getD1Database('DB');
const sql=readdirSync(root+'migrations').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync(root+'migrations/'+f,'utf8')).join('\n');
const statements=JSON.parse(execFileSync('python3',['-c',"import sys,sqlite3,json; out=[]; current=''\nfor c in sys.stdin.read():\n current+=c\n if c==';' and sqlite3.complete_statement(current):out.append(current);current=''\nprint(json.dumps(out))"],{input:sql,encoding:'utf8'}));
for(const statement of statements)await db.prepare(statement).run();
const origin='https://data.admira.app',journey=process.env.QA_JOURNEY==='1';let cookie;
const invoke=(path,body,method='POST',headers={})=>mf.dispatchFetch(origin+'/api/installer'+path,{method,headers:{Origin:'https://www.admira.app','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
if(!journey){const a=await invoke('/register',account({name:'Ana · QA aislado',skills:['screen','network'],radius_km:65}));cookie=a.headers.get('set-cookie').split(';')[0];}
const other=await invoke('/register',account({name:'Otro instalador · QA aislado'}));const otherCookie=other.headers.get('set-cookie').split(';')[0];
for(const [n,title] of ['Pantalla del estanco sin señal','Red de la cafetería interrumpida','Trabajo de otro instalador'].entries()){
 const ev=event({title,device:{id:'mobile-qa-'+n,name:n===1?'Red · Cafetería QA':'Pantalla · Estanco QA',latitude:41.3874,longitude:2.1686,address:'Dirección privada de QA '+n,skill:'screen',timeout_seconds:120}});
 const req=await signed({INSTALLER_ADMIRA_SECRET:'isolated-test-secret'},ev);const r=await mf.dispatchFetch(req.url,{method:'POST',headers:req.headers,body:await req.text()});if(r.status!==202)throw Error(await r.text());
}
await mf.dispatchFetch(origin+'/test/dispatch');const jobs=(await(await invoke('/inbox',undefined,'GET',journey?{Cookie:otherCookie}:{})).json()).notifications;await invoke('/incidents/'+jobs.find(j=>j.title==='Trabajo de otro instalador').id+'/accept',{},'POST',{Cookie:otherCookie});
let failWrite=false,failUpload=false,failClose=false,failInbox=false,failDetail=false,dropUpload=false,dropClose=false,failAuth=false,failPhotoRead=false,meDelay=0,writeDelay=0,geocodeMode='fixture',registerWrites=0;
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:8901');const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks);
 if(url.pathname==='/control'){const b=JSON.parse(raw.toString()||'{}');if('failWrite'in b)failWrite=b.failWrite;if('failUpload'in b)failUpload=b.failUpload;if('failClose'in b)failClose=b.failClose;if('failInbox'in b)failInbox=b.failInbox;if('failDetail'in b)failDetail=b.failDetail;if('dropUpload'in b)dropUpload=b.dropUpload;if('dropClose'in b)dropClose=b.dropClose;if('failAuth'in b)failAuth=b.failAuth;if('failPhotoRead'in b)failPhotoRead=b.failPhotoRead;if('meDelay'in b)meDelay=b.meDelay;if('writeDelay'in b)writeDelay=b.writeDelay;if('geocodeMode'in b)geocodeMode=b.geocodeMode;if(b.expire)await db.prepare('DELETE FROM installer_sessions').run();res.end('{}');return;}
 if(url.pathname==='/stats'){const incidents=(await db.prepare('SELECT id,title,status,resolution,evidence_url FROM installer_incidents').all()).results;const photos=(await db.prepare('SELECT id,incident_id,object_key,size FROM installer_evidence').all()).results;const bucket=await mf.getR2Bucket('INSTALLER_EVIDENCE');const persisted=[];for(const p of photos){const o=await bucket.get(p.object_key);persisted.push({id:p.id,size:o?(await o.arrayBuffer()).byteLength:0});}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({registerWrites,incidents,photos,persisted,timeline:(await db.prepare('SELECT kind,detail FROM incident_timeline').all()).results,profile:(await(await invoke('/me',undefined,'GET')).json()).profile}));return;}
 if(url.pathname==='/geocode'){res.setHeader('Content-Type','application/json');if(geocodeMode==='fail'){res.writeHead(503);res.end(JSON.stringify({error:'location_unavailable'}));return;}res.end(JSON.stringify({places:geocodeMode==='empty'?[]:[{city:'Barcelona',country:'ES',label:'Barcelona · España (QA aislado)',latitude:41.3874,longitude:2.1686}]}));return;}
 if(req.method!=='GET'&&writeDelay)await new Promise(r=>setTimeout(r,writeDelay));
 if((url.pathname==='/me'&&failAuth)||(url.pathname.startsWith('/evidence/')&&failPhotoRead)||(req.method!=='GET'&&failWrite)||(url.pathname.endsWith('/photos')&&failUpload)||(url.pathname.endsWith('/resolve')&&failClose)||(url.pathname==='/inbox'&&failInbox)||(/^\/incidents\/[^/]+$/.test(url.pathname)&&failDetail)){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Fallo de conexión aislado para QA'}));return;}
 const response=await mf.dispatchFetch(origin+'/api/installer'+url.pathname,{method:req.method,headers:{Origin:'https://www.admira.app','Content-Type':req.headers['content-type']||'application/json',Cookie:journey?(req.headers.cookie||''):cookie},body:raw.length?raw:undefined});
 if(url.pathname==='/me'&&meDelay)await new Promise(r=>setTimeout(r,meDelay));
 if(url.pathname==='/register'&&req.method==='POST')registerWrites++;
 if(journey&&response.ok&&['/register','/login','/logout'].includes(url.pathname)){cookie=response.headers.get('set-cookie')?.split(';')[0]||cookie;if(url.pathname==='/register')await mf.dispatchFetch(origin+'/test/dispatch');}
 if(dropClose&&url.pathname.endsWith('/resolve')&&response.ok){dropClose=false;res.destroy();return;}
 if(dropUpload&&url.pathname.endsWith('/photos')&&response.ok){dropUpload=false;res.destroy();return;}
 const responseBody=Buffer.from(await response.arrayBuffer());res.writeHead(response.status,Object.fromEntries(response.headers));res.end(responseBody);
 }catch(e){console.error(e.message);if(res.headersSent){res.destroy();return;}res.writeHead(500);res.end(JSON.stringify({error:'Isolated backend failure'}));}}).listen(8901,'127.0.0.1',()=>console.log('READY isolated workerd + D1 + private disk-persisted R2, port 8901; storage '+storage));
process.on('SIGTERM',async()=>{await mf.dispose();process.exit();});
