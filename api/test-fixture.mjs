import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleInstaller} from './src/installer-portal.js';
const ORIGIN='https://www.yokup.com';
function setup(){
 const db=new DatabaseSync(':memory:');for(const file of ['0001_installer_portal.sql','0002_retailer_portal.sql','0003_portal_mcp.sql','0004_retailer_site_imports.sql','0005_retailer_site_circuits.sql','0006_retailer_map_catalog.sql','0007_portal_access.sql','0008_installer_radius.sql','0009_portal_google.sql'])db.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));
 const prepare=sql=>({bind(...args){const exec=()=>db.prepare(sql);return {first:async()=>exec().get(...args)||null,all:async()=>({results:exec().all(...args)}),run:async()=>({meta:{changes:Number(exec().run(...args).changes)}})}; }});
 const env={INSTALLER_ADMIRA_SECRET:'test-only-secret',DB:{prepare,batch:async statements=>{db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 return {db,env};
}
async function call(env,path,body,cookie,method=body?'POST':'GET',origin=ORIGIN){
 const headers={Origin:origin,'Content-Type':'application/json'};if(cookie)headers.Cookie=cookie;
 const r=await handleInstaller(new Request('https://data.yokup.com/api/installer'+path,{method,headers,body:body?JSON.stringify(body):undefined}),env);
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
}
function account(overrides={}){return {name:'Test Installer',email:crypto.randomUUID()+'@example.test',password:'correct-horse-battery',country:'ES',city:'Barcelona',latitude:41.3874,longitude:2.1686,skills:['screen'],...overrides};}
function event(overrides={}){return {event_id:crypto.randomUUID(),type:'fault',occurred_at:new Date().toISOString(),title:'Pantalla sin señal',device:{id:'screen-1',name:'Pantalla tienda',latitude:41.3874,longitude:2.1686,address:'Dirección privada 12',skill:'screen',timeout_seconds:120},...overrides};}
async function signed(env,payload,options={}){
 const body=JSON.stringify(payload), timestamp=String(Math.floor(Date.now()/1000));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.INSTALLER_ADMIRA_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+body));
 const signature=Buffer.from(bytes).toString('hex');
 return new Request('https://data.yokup.com/api/installer/events',{method:'POST',body,headers:{'X-Admira-Timestamp':timestamp,'X-Admira-Signature':signature,...options}});
}

export {setup,call,account,event,signed};
