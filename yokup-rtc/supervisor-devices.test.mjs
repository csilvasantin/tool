import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleSupervisorDevices,deviceRpc} from './src/supervisor-devices.js';
const xpacio='alsea-sbux-021',code='PDG103-TPV-01',screen='fold-test-physical';
const id='00000000-0000-4000-8000-000000000001',action='00000000-0000-4000-8000-000000000002',now=1792089000000;
function fixture(t){
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 const DB={prepare(sql){const statement=sqlite.prepare(sql);let values=[];return {bind(...v){values=v;return this;},async run(){const result=statement.run(...values);return {meta:{changes:Number(result.changes)}};},async first(){return statement.get(...values)||null;},async all(){return {results:statement.all(...values)};}};}};
 const f={now,registry:[{screen,player:'android'}],cis:[{itil_code:code,category:'tpv',lifecycle:{status:'operational'}}],signal:{screen,signal_recent:true,last_seen:now-1000,capabilities:{remote_commands:true}},ack:'executed',sent:0,session:{email:'operator@example.com'},access:{allowed:true,canChangeProject:true}};
 f.env={DB,SUPERVISOR_PLAYER_KEY:'test-private-key',INCIDENT_DESK:{fetch:async()=>Response.json({ok:true,xpacio:{admira_store_id:xpacio},cis:f.cis})}};
 f.rpc=async(_env,name,args)=>{if(name==='player_status')return f.signal;if(name==='player_command'){f.sent++;if(f.lost)throw Error('test-private-key');return {screen,command:args.command,action,cid:1,status:'queued'};}return {...args,screen:f.mismatch?'another-device':screen,status:f.ack,appliedAt:now};};
 f.call=async(path,body)=>{const r=await handleSupervisorDevices(new Request('https://api.admira.app'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}),f.env,{session:f.session,access:f.access,json:(d,status=200)=>Response.json(d,{status}),now:f.now,fetchImpl:async()=>Response.json({screens:f.registry}),rpc:f.rpc});return {status:r.status,body:await r.json()};};
 f.bind=()=>f.call('/supervisor/connections',{xpacio,code,screen,label:'Samsung Fold',scope:'demo'});
 f.send=(changes={})=>f.call('/supervisor/command',{xpacio,code,command:'info-show',request_id:id,...changes});
 return f;
}
test('EN: unauthorized user cannot initialize storage or query fleet',async()=>{
 const r=await handleSupervisorDevices(new Request('https://api.admira.app/supervisor/devices'),{}, {session:{email:'reader@example.com'},access:{allowed:true,canChangeProject:false},json:(d,status=200)=>Response.json(d,{status})});assert.equal(r.status,403);
});
test('ES: vínculo exige CI activo y hardware físico; no convierte un player virtual en TPV',async t=>{
 const f=fixture(t);f.registry=[{screen:'virtual-fold',player_type:'virtual'}];assert.equal((await f.bind()).body.error,'physical_device_not_registered');
 f.registry=[{screen}];f.cis=[];assert.equal((await f.bind()).status,404);
 f.cis=[{itil_code:code,category:'mobiliario',lifecycle:{}}];assert.equal((await f.bind()).body.error,'player_category_required');
});
test('EN: binding and telemetry expose explicit demo scope and dated player signal without credentials',async t=>{
 const f=fixture(t);assert.equal((await f.bind()).status,200);const r=await f.call('/supervisor/connections?xpacio='+xpacio);
 assert.equal(r.body.connections[0].scope,'demo');assert.equal(r.body.connections[0].telemetry.last_seen,now-1000);assert.equal(r.body.connections[0].telemetry.recent,true);assert.doesNotMatch(JSON.stringify(r),/test-private-key|operator@example/);
 f.now+=91000;assert.equal((await f.call('/supervisor/connections?xpacio='+xpacio)).body.connections[0].telemetry.recent,false);
});
test('ES: señal antigua, CI retirado y destino impuesto por cliente no envían orden',async t=>{
 const f=fixture(t);await f.bind();f.signal.last_seen=now-91000;assert.equal((await f.send()).body.error,'device_without_recent_signal');f.signal.last_seen=now;
 assert.equal((await f.send({screen:'other'})).body.error,'invalid_fields');f.cis[0].lifecycle.status='retired';assert.equal((await f.send()).body.error,'ci_not_found');assert.equal(f.sent,0);
});
test('EN: missing dedicated credential fails closed before device mutation',async t=>{
 const f=fixture(t);await f.bind();delete f.env.SUPERVISOR_PLAYER_KEY;assert.equal((await f.send()).status,503);assert.equal(f.sent,0);
});
test('ES: reserva SQL e idempotencia impiden duplicar una orden aunque se repita la petición',async t=>{
 const f=fixture(t);await f.bind();const [a,b]=await Promise.all([f.send(),f.send()]);assert.equal(f.sent,1);assert.ok([a,b].some(r=>r.body.order?.status==='queued'));
 const replay=await f.send();assert.equal(replay.body.order.status,'queued');assert.equal(f.sent,1);assert.equal((await f.send({request_id:action})).body.error,'command_in_progress');
 assert.equal((await f.send({command:'next'})).body.error,'request_conflict');f.now+=120000;f.signal.last_seen=f.now;assert.equal((await f.send({request_id:action})).body.error,'command_in_progress');assert.equal((await f.call('/supervisor/connections?xpacio='+xpacio)).body.connections[0].last_order.id,id);
});
test('EN: lost delivery stays unknown and replay never resends',async t=>{
 const f=fixture(t);await f.bind();f.lost=true;assert.equal((await f.send()).body.order.status,'unknown');assert.equal((await f.send()).body.order.status,'unknown');assert.equal(f.sent,1);assert.doesNotMatch(JSON.stringify(await f.send()),/test-private-key/);
});
test('ES: solo el acuse del mismo equipo, acción y orden acredita ejecución',async t=>{
 const f=fixture(t);await f.bind();await f.send();f.mismatch=true;assert.equal((await f.call('/supervisor/command?id='+id)).body.error,'ack_identity_mismatch');f.mismatch=false;f.ack='pending';assert.equal((await f.call('/supervisor/command?id='+id)).body.order.executed,false);f.ack='executed';const r=await f.call('/supervisor/command?id='+id);assert.equal(r.body.order.executed,true);assert.equal(r.body.order.status,'executed');assert.equal(f.sent,1);
});
test('EN: ignored and failed receipts are not execution; another actor cannot read orders',async t=>{
 const f=fixture(t);await f.bind();await f.send();f.session={email:'another@example.com'};assert.equal((await f.call('/supervisor/command?id='+id)).status,404);f.session={email:'operator@example.com'};f.ack='ignored';const r=await f.call('/supervisor/command?id='+id);assert.equal(r.body.order.executed,false);assert.equal(r.body.order.status,'ignored');
});
test('ES: cliente MCP no permite órdenes sin clave ni adjunta clave a lecturas',async()=>{
 await assert.rejects(deviceRpc({},'player_command',{}),/tool_forbidden/);
 await assert.rejects(deviceRpc({},'player_command',{}, {write:true}),/control_unconfigured/);
 let auth;await deviceRpc({SUPERVISOR_PLAYER_KEY:'private'},'player_status',{screen},{fetchImpl:async(_url,init)=>{auth=init.headers.Authorization;return Response.json({result:{content:[{type:'text',text:'{}'}]}});}});assert.equal(auth,undefined);
});
