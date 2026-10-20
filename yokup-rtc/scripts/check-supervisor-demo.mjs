// Isolated headless QA. No production accounts, incidents, cameras or Telegram.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {Miniflare}=require(process.env.MINIFLARE_MODULE||'miniflare');
const esbuild=require(process.env.ESBUILD_MODULE||'esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const source=path.resolve(import.meta.dirname,'../src/supervisor-demo.js');
const site=path.resolve(import.meta.dirname,'../../yokup-site');
const out=await fs.mkdtemp(path.join(os.tmpdir(),'supervisor-6847-'));
const event='00000000-0000-4000-8000-000000000001';
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const wrapper=`import {handleSupervisorDemo} from ${JSON.stringify(source)};
let options={},sends=0,orders=0,applied=0;
const json=(value,status=200)=>Response.json(value,{status});
export default {async fetch(req,env){
const u=new URL(req.url);
if(u.pathname==='/qa/control'){Object.assign(options,await req.json());return json({ok:true});}
if(u.pathname==='/qa/stats')return json({sends,orders,tickets:(await env.DB.prepare('SELECT status FROM tickets').all()).results,evidence:(await env.MEDIA.list({prefix:'supervisor-demo/'})).objects.length});
await env.DB.exec("CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,screen TEXT UNIQUE,status TEXT,source TEXT,resolved_at INTEGER,updated_at INTEGER); CREATE TABLE IF NOT EXISTS events(ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT); CREATE TABLE IF NOT EXISTS supervisor_device_bindings(xpacio TEXT,code TEXT,screen TEXT,scope TEXT); INSERT OR IGNORE INTO supervisor_device_bindings(rowid,xpacio,code,screen,scope) VALUES(1,'alsea-sbux-021','PDG103-PAN-01','isolated-qa-screen','demo')");
const runtime={...env,TELEGRAM:{fetch:async()=>json({fleet_publish:true})},SUPERVISOR_DEMO_CONTROL:{},SUPERVISOR_TELEGRAM_BOT_TOKEN:'isolated-only',SUPERVISOR_TELEGRAM_PRIVATE_CHAT_ID:'12345',INCIDENT_DESK:{fetch:async()=>json({ok:true,xpacio:{admira_store_id:'alsea-sbux-021'},cis:[{itil_code:'PDG103-PAN-01',category:'pantalla',lifecycle:{status:'operational'}}]})}};
if(options.uploadFail)runtime.MEDIA={put:async()=>{throw Error('isolated_upload_failure');},get:key=>env.MEDIA.get(key)};
const deps={json,session:{email:'isolated-operator@example.test'},access:{allowed:true,canChangeProject:!options.forbidden},ensureSchema:async()=>{},portalAssigned:async()=>false,
createIncident:async(_env,inc)=>{await env.DB.prepare("INSERT OR IGNORE INTO tickets VALUES('INC-QADEMO',?,'open','supervisor-demo',NULL,?)").bind(inc.resource,Date.now()).run();return 'INC-QADEMO';},
control:async(_env,row,poll)=>{if(!poll){orders++;applied=Date.now();}if(options.controlLost)throw Error('isolated');return {event_id:row.event_id,screen:row.screen,request_id:row.clear_id,status:options.executed?'executed':'queued',applied_at:applied};},
fetchImpl:async()=>{sends++;if(options.telegramLost)throw Error('isolated');return json({ok:true,result:[1,2].map(message_id=>({message_id,chat:{id:12345,type:'private'}}))});}};
if(u.pathname==='/qa/seed')req=new Request('https://api.yokup.com/supervisor/demo/incidents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:${JSON.stringify(event)},xpacio:'alsea-sbux-021',code:'PDG103-PAN-01',description:'PRUEBA AISLADA · popup sobre contenido; no es una incidencia real',observed_at:Date.now(),before:{type:'image/png',base64:${JSON.stringify(image)}}})});
return handleSupervisorDemo(req,runtime,deps);
}};`;
const build=await esbuild.build({stdin:{contents:wrapper,resolveDir:import.meta.dirname},bundle:true,format:'esm',platform:'browser',write:false});
const mf=new Miniflare({modules:true,script:build.outputFiles[0].text,compatibilityDate:'2026-08-08',d1Databases:{DB:'supervisor-demo-qa'},r2Buckets:['MEDIA'],d1Persist:path.join(out,'d1'),r2Persist:path.join(out,'r2')});
const dispatch=(url,init)=>mf.dispatchFetch('https://api.yokup.com'+url,init);
const control=values=>dispatch('/qa/control',{method:'POST',body:JSON.stringify(values)});
let browser;const checks=[];
function check(label,value){assert.ok(value,label);checks.push(label);}
try{
  const seeded=await dispatch('/qa/seed');assert.equal(seeded.status,201,await seeded.clone().text());
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  const errors=[];let failNetwork=false;
  await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.hostname==='api.yokup.com'&&u.pathname.startsWith('/supervisor/demo/')){
      if(failNetwork)return route.abort('failed');
      const response=await mf.dispatchFetch(req.url(),{method:req.method(),headers:req.headers(),...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})});
      return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
    }
    if(u.origin==='https://www.admira.app'){
      const file=u.pathname==='/supervisor'?'supervisor.html':u.pathname.slice(1);
      if(file==='supervisor.html'){
        let html=await fs.readFile(path.join(site,file),'utf8');
        html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
        html=html.replace('</body>','<script>window.YkAccess={ready:Promise.resolve()};</script><script type="module" src="/yk-supervisor-demo.js"></script></body>');
        html=html.replace('<main','<p style="color:#ffcc70;padding:12px">PRUEBA AISLADA · D1 y R2 locales · transporte de player y Telegram simulado</p><main');
        return route.fulfill({contentType:'text/html',body:html});
      }
      if(!file.includes('..')&&/\.(css|js|png|svg|webp)$/.test(file)){try{return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'image/'+file.split('.').at(-1),body:await fs.readFile(path.join(site,file))});}catch{}}
    }
    return route.fulfill({status:404,body:''});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});await page.goto('https://www.admira.app/supervisor');
  await page.locator('#demoTitle').filter({hasText:'INC-QADEMO'}).waitFor();
  check('aviso real de la API aislada visible',(await page.locator('#demoDescription').textContent()).includes('PRUEBA AISLADA'));
  await page.locator('#demoClear').click();await page.waitForFunction(()=>document.getElementById('demoFacts').textContent.includes('queued'));
  check('orden en cola conserva cierre deshabilitado',await page.locator('#demoClose').isDisabled());
  await control({executed:true});await page.locator('#demoReceipt').click();await page.waitForFunction(()=>!document.getElementById('demoClose').disabled);
  await page.locator('#demoCause').fill('Popup de QA, sin cuenta ni intervención productiva');await page.locator('#demoAction').fill('Retirada específica y revisión de la captura posterior');
  const recovery=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVQIHWP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
  await page.locator('#demoPhoto').setInputFiles({name:'recuperacion-qa.png',mimeType:'image/png',buffer:recovery});
  await page.waitForFunction(()=>!document.getElementById('demoLocalPreview').hidden);
  const captured=new Date(Date.now()+1000),local=new Date(captured.getTime()-captured.getTimezoneOffset()*60000).toISOString().slice(0,19);
  await page.locator('#demoCaptured').fill(local);await page.locator('#demoReviewed').check();
  await control({uploadFail:true});await page.locator('#demoClose').click();await page.waitForFunction(()=>document.getElementById('demoStatus').dataset.error==='true');
  check('fallo de subida conserva texto',(await page.locator('#demoCause').inputValue()).includes('Popup de QA'));
  check('fallo de subida conserva foto',await page.locator('#demoLocalPreview').isVisible());
  let stats=await (await dispatch('/qa/stats')).json();check('fallo de subida conserva ticket abierto',stats.tickets[0].status==='open');
  await control({uploadFail:false});await page.locator('#demoRefresh').click();await page.waitForFunction(()=>!document.getElementById('demoClose').disabled);
  failNetwork=true;await page.locator('#demoClose').click();await page.waitForFunction(()=>document.getElementById('demoStatus').dataset.error==='true');
  check('fallo de red conserva captura',await page.locator('#demoLocalPreview').isVisible());
  failNetwork=false;await page.locator('#demoRefresh').click();await page.waitForFunction(()=>!document.getElementById('demoClose').disabled);
  await page.locator('#demoClose').click();await page.waitForFunction(()=>!document.getElementById('demoReport').disabled);
  stats=await (await dispatch('/qa/stats')).json();check('cierre canónico persistido en D1',stats.tickets[0].status==='resolved');check('ambas fotos guardadas en R2',stats.evidence===2);
  await page.locator('#demoReport').click();await page.waitForFunction(()=>document.getElementById('demoDelivery').textContent.includes('Lectura humana sin confirmar'));
  stats=await (await dispatch('/qa/stats')).json();check('parte único con transporte aislado',stats.sends===1&&stats.orders===1);
  await page.reload();await page.locator('#demoTitle').filter({hasText:'INC-QADEMO'}).waitFor();check('recarga conserva cierre y recibo',(await page.locator('#demoDelivery').textContent()).includes('Lectura humana sin confirmar'));
  for(const width of [375,390,768,1440]){
    await page.setViewportSize({width,height:1000});await page.locator('#supervisorDemo').scrollIntoViewIfNeeded();
    check('sin desbordamiento en ficha '+width,await page.locator('#supervisorDemo').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await page.screenshot({path:path.join(out,'supervisor-demo-'+width+'.png'),fullPage:false});
  }
  await control({forbidden:true});await page.locator('#demoRefresh').click();await page.waitForFunction(()=>document.getElementById('demoStatus').textContent.includes('no tiene permiso'));
  check('403 deshabilita acciones',await page.locator('#demoClear').isDisabled()&&await page.locator('#demoReport').isDisabled());
  check('sin errores JavaScript',errors.length===0);
  await fs.writeFile(path.join(out,'checks.json'),JSON.stringify({isolated:true,physical_camera:false,real_telegram:false,checks},null,2));
  console.log(JSON.stringify({ok:true,checks:checks.length,evidence_directory:out,physical_camera:false,real_player:false,real_telegram:false},null,2));
}finally{await browser?.close();await mf.dispose();}
