import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {classifyIncident,playerSignals,agentSamples,ensureSensorSchema,queueSignal,flushSensorOutbox,runIncidentSensors} from './src/incident-sensors.js';
const now=1790361000000;
const DB=()=>{const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE tickets(id TEXT PRIMARY KEY,status TEXT,source TEXT,assignee TEXT,loc TEXT)');return {db,prepare(sql){return {bind(...args){return {async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}}}}}}};};
const data=(rows=[])=>({ok:true,presence:rows,control_machines:[{machine:'MacMini',updated:now/1000,slots:[{persona:'Oraculo'}]}]});
const assignment=[{assignee:'OraculoMacMini',loc:'macmini'}];
const live={persona:'Oraculo',machine:'MacMini',source:'process_snapshot',verified:1,updated:now/1000};
test('clasificación estricta campo/digital; telemetría player ausente o antigua no abre',()=>{
 assert.equal(classifyIncident({sensor:'player'}).channel,'campo');assert.equal(classifyIncident({sensor:'agent'}).channel,'digital');assert.throws(()=>classifyIncident({sensor:'inventado'}));
 assert.throws(()=>playerSignals({screens:[]},now),/stale/);
 assert.equal(playerSignals({fetched_at:now,screens:[{screen:'p',online:false,age_seconds:301},{screen:'q',age_seconds:999}]},now).length,1);
});
test('agentes: máquina fresca, tarea activa y proceso real; pausa o máquina obsoleta se excluyen',()=>{
 assert.equal(agentSamples(data([live]),assignment,now)[0].healthy,true);
 assert.equal(agentSamples(data([{...live,verified:0}]),assignment,now)[0].healthy,false);
 assert.equal(agentSamples(data([{...live,cli_paused:true}]),assignment,now).length,0);
 assert.equal(agentSamples(data([live]),[],now).length,0);
 const stale=data([]);stale.control_machines[0].updated-=300;assert.equal(agentSamples(stale,assignment,now).length,0);
});
test('outbox reintenta, conserva id y no duplica entrega; coords ausentes quedan pendientes',async()=>{
 const env={DB:DB(),ADMIRA_TELEGRAM_PANEL_KEY:'test'};await ensureSensorSchema(env);
 env.DB.db.exec("INSERT INTO tickets(id,status) VALUES('A','open'),('P','open')");
 const signal={sensor:'agent',resource:'agt:oraculo',subject:'Agente caído',detail:'Prueba'};
 await queueSignal(env,'A',signal,now);await queueSignal(env,'A',signal,now);
 await queueSignal(env,'P',{...signal,sensor:'player'},now);
 let requests=[];env.INCIDENT_DESK={fetch:async req=>{requests.push(await req.json());return Response.json({error:'down'},{status:503})}};
 assert.equal((await flushSensorOutbox(env,now)).pending,2);
 env.INCIDENT_DESK.fetch=async req=>{requests.push(await req.json());return Response.json({ok:true,id:'desk:a',channel:'digital'})};
 assert.equal((await flushSensorOutbox(env,now+1)).delivered,1);
 await flushSensorOutbox(env,now+2);assert.equal(requests.length,2);assert.equal(requests[0].external_id,requests[1].external_id);
 assert.equal(env.DB.db.prepare("SELECT last_error FROM incident_sensor_outbox WHERE ticket_id='P'").get().last_error,'player_coordinates_required');
 env.DB.db.exec("UPDATE tickets SET status='resolved' WHERE id='P'");await flushSensorOutbox(env,now+3);
 assert.equal(env.DB.db.prepare("SELECT status FROM incident_sensor_outbox WHERE ticket_id='P'").get().status,'obsolete');
});
test('dos sensores, umbral persistente y recuperación sin cierre automático del Desk',async()=>{
 const env={DB:DB(),ADMIRA_TELEGRAM_PANEL_KEY:'test'};let current=data([live]),created=[],recovered=[];
 env.DB.db.exec("INSERT INTO tickets VALUES('FLT-TEST','in_progress','fleet','OraculoMacMini','MacMini')");
 env.TELEGRAM={fetch:async()=>Response.json(current)};
 env.INCIDENT_DESK={fetch:async req=>{const p=await req.json();return Response.json({ok:true,id:'desk:'+p.external_id,channel:p.channel})}};
 const adapters={fetch:async()=>Response.json({fetched_at:now,screens:[{screen:'p',online:false,age_seconds:500,latitude:41,longitude:2}]}),createPlayer:async()=>{env.DB.db.exec("INSERT OR IGNORE INTO tickets(id,status) VALUES('P','open')");return 'P'},createAgent:async s=>{created.push(s);env.DB.db.exec("INSERT OR IGNORE INTO tickets(id,status) VALUES('A','open')");return 'A'},recoverAgent:async r=>recovered.push(r)};
 const first=await runIncidentSensors(env,adapters,now);assert.equal(first.players,1);assert.equal(first.delivery.delivered,1);assert.equal(created.length,0);
 current=data([]);current.control_machines[0].updated=(now+21*60000)/1000;
 const second=await runIncidentSensors(env,adapters,now+21*60000);assert.equal(second.agents,1);assert.equal(second.delivery.delivered,1);
 current=data([{...live,updated:(now+22*60000)/1000}]);current.control_machines[0].updated=(now+22*60000)/1000;
 await runIncidentSensors(env,adapters,now+22*60000);assert.equal(recovered.length,2);
 assert.equal(env.DB.db.prepare("SELECT status FROM tickets WHERE id='A'").get().status,'open');
});
