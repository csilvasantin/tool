import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {handleIncidentMap} from './src/incident-map.js';
const json=(d,s=200)=>Response.json(d,{status:s});
test('canonical map excludes closed/cancelled tickets and missions; severe dominates; recovery remains active',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE tickets(id TEXT,loc TEXT,status TEXT,priority TEXT,role TEXT,source TEXT)');
 const ins=db.prepare('INSERT INTO tickets(id,loc,status,priority) VALUES(?,?,?,?)');
 for(const r of [['INC-A','store-a','open','normal'],['INC-B','store-a','in_progress','alta'],['INC-C','store-b','open','baja'],['INC-D','store-c','resolved','urgente'],['INC-E','store-c','cancelled','alta'],['FLT-X','store-d','open','urgente'],['INC-F','','open','alta'],['INC-G','store-e','open','urgente']])ins.run(...r);
 db.exec("INSERT INTO tickets VALUES('INC-MIS','store-z','open','alta','mission','legacy')");
 const env={DB:{prepare:s=>({all:async()=>({results:db.prepare(s).all()})})}};
 const response=await handleIncidentMap(env,json);const d=await response.json();assert.equal(response.status,200);
 assert.deepEqual(d.locations,[{id:'store-a',active:2,severe:1,level:2},{id:'store-b',active:1,severe:0,level:1},{id:'store-e',active:1,severe:1,level:2}]);
 assert.ok(!JSON.stringify(d).includes('INC-'));assert.match(response.headers.get('cache-control'),/max-age=5/);db.close();
});
test('database failure never returns an empty green map',async()=>{const r=await handleIncidentMap({DB:{prepare(){throw Error('offline')}}},json);assert.equal(r.status,503);assert.equal((await r.json()).ok,false)});
