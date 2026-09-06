import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {handleMcp,hash,TOOLS} from './src/mcp.js';

const individualToken='ykm_'+'I'.repeat(43);
const fleetSeed='flt-2143-independent-fleet-seed';
const encoder=new TextEncoder();

async function fleetKey(seed,persona,equipo){
  const imported=await crypto.subtle.importKey('raw',encoder.encode(seed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',imported,encoder.encode(`${persona}|${equipo}`)));
  return Buffer.from(signature).toString('base64url').slice(0,40);
}

async function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('./migrations/0001_mcp.sql',import.meta.url),'utf8'));
  await db.prepare('INSERT INTO yokup_mcp_credentials VALUES(?,?,?,?,?,?,?,NULL)')
    .run(await hash(individualToken),'OraculoMacMini','MacMini','["yokup"]','["read","inbox","send","work"]',1,Date.now()+60000);
  const dbCalls=[],serviceCalls=[];
  const stmt=(sql,args=[])=>({
    bind:(...values)=>stmt(sql,values),
    first:async()=>{dbCalls.push({sql,args});return db.prepare(sql).get(...args)||null;},
    all:async()=>{dbCalls.push({sql,args});return {results:db.prepare(sql).all(...args)};},
    run:async()=>{dbCalls.push({sql,args});return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}
  });
  const env={
    DB:{prepare:stmt},MCP_FLOTA_SEED:fleetSeed,
    RTC:{fetch:async(request)=>{
      serviceCalls.push({method:request.method,path:new URL(request.url).pathname,authorization:request.headers.has('authorization')});
      return Response.json({projects:[
        {id:'yokup',status:'activo',agents:['OraculoMacMini','TrinityMBP14'],machines:['MacMini','MacBookPro14']},
        {id:'otro',status:'activo',agents:['NeoMBP14'],machines:['MacBookPro14']},
        {id:'archivado',status:'archivado',agents:['OraculoMacMini'],machines:['MacMini']}
      ]});
    }}
  };
  const access=[];
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const request=new Request(`http://127.0.0.1${req.url}`,{
      method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined,duplex:'half'
    });
    const response=await handleMcp(request,env);
    access.push({method:req.method,path:req.url,status:response.status});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address(),endpoint=`http://127.0.0.1:${address.port}/mcp`;
  return {db,dbCalls,serviceCalls,access,server,endpoint};
}

async function rpc(endpoint,token,method,id=1,params){
  const headers={'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'};
  if(token)headers.authorization=`Bearer ${token}`;
  const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,...(params?{params}:{})})});
  const text=await response.text();
  return {status:response.status,headers:response.headers,text,json:text?JSON.parse(text):null};
}

function result(response){return response.json?.result?.structuredContent;}
function assertNoCredentialLeak(value,secrets){
  const serialized=typeof value==='string'?value:JSON.stringify(value);
  for(const secret of secrets)assert.ok(!serialized.includes(secret),'una credencial apareció en salida o trazas');
}

test('cliente JSON-RPC HTTP acepta credencial individual y clave común persona-equipo con los mismos scopes',async(t)=>{
  const f=await fixture();t.after(()=>f.server.close());
  const commonToken=await fleetKey(fleetSeed,'Oraculo','MacMini');
  const cases=[['individual',individualToken],['flota',commonToken]];
  for(const [label,token] of cases){
    const init=await rpc(f.endpoint,token,'initialize',1,{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:`qa-${label}`,version:'1'}});
    assert.equal(init.status,200);assert.equal(init.json.result.serverInfo.name,'yokup');
    const listed=await rpc(f.endpoint,token,'tools/list',2);
    assert.equal(listed.status,200);assert.deepEqual(listed.json.result.tools.map(tool=>tool.name),TOOLS.map(tool=>tool.name));
    const who=await rpc(f.endpoint,token,'tools/call',3,{name:'yokup_whoami',arguments:{}});
    assert.equal(who.status,200);assert.deepEqual(result(who),{
      actor:'OraculoMacMini',machine:'MacMini',projects:['yokup'],scopes:['read','inbox','send','work'],expires_at:label==='individual'?result(who).expires_at:null
    });
    assertNoCredentialLeak([init.text,listed.text,who.text],cases.map(([,secret])=>secret));
  }
  assert.ok(f.serviceCalls.some(call=>call.path==='/projects'),'la clave de flota deriva proyectos del censo');
  assert.ok(f.serviceCalls.every(call=>call.authorization===false),'la clave cliente no cruza al servicio RTC');
  assertNoCredentialLeak({dbCalls:f.dbCalls,serviceCalls:f.serviceCalls,access:f.access},cases.map(([,secret])=>secret));
});

test('cliente JSON-RPC HTTP rechaza credencial ausente o incorrecta sin filtrar claves ni ampliar acceso',async(t)=>{
  const f=await fixture();t.after(()=>f.server.close());
  const wrong='clave-incorrecta-'+crypto.randomUUID();
  for(const token of ['',wrong]){
    const response=await rpc(f.endpoint,token,'tools/list');
    assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('www-authenticate'),'Bearer realm="yokup-mcp"');
    assert.deepEqual(response.json,{error:'invalid_token',help:'https://www.yokup.com/help#mcp'});
    assertNoCredentialLeak(response.text,[individualToken,fleetSeed,wrong]);
  }
  assert.equal(f.serviceCalls.length,0,'una clave desconocida no llega al censo ni amplía su superficie de lectura');
  assertNoCredentialLeak({dbCalls:f.dbCalls,serviceCalls:f.serviceCalls,access:f.access},[individualToken,fleetSeed,wrong]);
});
