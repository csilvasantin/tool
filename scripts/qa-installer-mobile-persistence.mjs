// Reopen the QA storage after stopping its server. No production API requests.
import {createRequire} from 'node:module';
import {join} from 'node:path';
const require=createRequire(new URL('../api/package.json',import.meta.url));
const {Miniflare}=require(process.env.MINIFLARE_MODULE||(process.env.QA_NODE_MODULES?join(process.env.QA_NODE_MODULES,'miniflare'):'miniflare'));
if(!process.argv[2])throw Error('Pass the QA storage directory announced by the server');
const m=new Miniflare({modules:true,script:`export default {async fetch(req,env){const {results}=await env.DB.prepare('SELECT e.object_key,e.size,i.status FROM installer_evidence e JOIN installer_incidents i ON i.id=e.incident_id').all();let verified=0;for(const row of results){const object=await env.INSTALLER_EVIDENCE.get(row.object_key);if(!object||(await object.arrayBuffer()).byteLength!==row.size||row.status!=='resolved')throw Error('Persistence mismatch');verified++;}return Response.json({verified});}};`,compatibilityDate:'2025-07-18',d1Databases:['DB'],r2Buckets:['INSTALLER_EVIDENCE'],resourcePersistencePath:process.argv[2]});
let timeout;try{const result=await Promise.race([m.dispatchFetch('http://localhost'),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Persistence read timed out')),15000))]);const data=await result.json();if(!data.verified)throw Error('No persisted photos');console.log('PASS fresh workerd reopened disk: '+data.verified+' persisted photo, matching bytes and resolved D1 state.');}finally{clearTimeout(timeout);await m.dispose();}
