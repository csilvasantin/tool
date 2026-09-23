// Local-only UI pilot: in-memory DB, synthetic admin, no external calls or production writes.
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';import {fileURLToPath} from 'node:url';
import {setup} from '../test-fixture.mjs';import {hash} from '../src/installer-portal.js';import {handleCalls} from '../src/calls.js';
const {env}=setup(),token=crypto.randomUUID(),root=fileURLToPath(new URL('../../yokup-site/',import.meta.url));
if(process.env.CALLS_TELEPHONE_DEMO==='1'){
 Object.assign(env,{TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-only',TWILIO_FROM:'+491111111111',TWILIO_DEMO_TO:'+34600000000'});
 env.TWILIO_FETCH=async()=>Response.json({sid:'CA'+'b'.repeat(32),status:'queued'});
}
await env.DB.prepare('INSERT INTO portal_admin_sessions VALUES(?,?,?,?)').bind(await hash(token),'csilva@admira.com','local-pilot',Date.now()+86400000).run();
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:8788');if(url.pathname.startsWith('/api/calls/')){const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const result=await handleCalls(new Request('https://data.yokup.com'+url.pathname+url.search,{method:req.method,headers:{...req.headers,origin:'http://127.0.0.1:8788',cookie:'__Host-yk_portal_admin='+token},body:['GET','HEAD'].includes(req.method)?undefined:body}),env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;}
const name=url.pathname==='/'?'/llamadas.html':extname(url.pathname)?url.pathname:url.pathname+'.html',path=resolve(root,'.'+name);if(!path.startsWith(root)){res.writeHead(403);res.end();return;}let data=await readFile(path);
if(process.env.CALLS_SYNTHETIC_AUDIO==='1'&&name==='/call-room.mjs'){
 let source=data.toString();
 source=source.replace('section.hidden=false;',"section.hidden=false;const probe=document.createElement('p');probe.id='synthetic-evidence';section.prepend(probe);probe.textContent='PRUEBA LOCAL: tono sintético, sin micrófono ni participantes reales.';join.textContent='Conectar audio sintético de prueba';audio.muted=true;let testContext;");
 source=source.replace('navigator.mediaDevices.getUserMedia({audio:true,video:false})',"(async()=>{testContext=new AudioContext();const out=testContext.createMediaStreamDestination(),osc=testContext.createOscillator();osc.frequency.value=440;osc.connect(out);osc.start();await testContext.resume();return out.stream;})()");
 source=source.replace('pc?.close();','pc?.close();testContext?.close();');
 source=source.replace('}catch(e){status.textContent=e.message;cleanup();}finally',"const stats=await pc.getStats();for(const s of stats.values())if(s.type==='inbound-rtp'&&s.kind==='audio')probe.textContent='AUDIO SINTÉTICO RECIBIDO: '+s.packetsReceived+' paquetes, '+s.bytesReceived+' bytes. Sin micrófono físico.';}catch(e){status.textContent=e.message;cleanup();}finally");
 data=Buffer.from(source);
}
res.writeHead(200,{'Content-Type':({'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.geojson':'application/json'})[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
}catch(e){res.writeHead(500);res.end('Local pilot: '+e.message);}}).listen(8788,'127.0.0.1',()=>console.log('LOCAL SYNTHETIC PILOT http://127.0.0.1:8788/llamadas — no production writes'));
