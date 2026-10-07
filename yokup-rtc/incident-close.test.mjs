import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {normalizeIncidentAction,applyIncidentAction,serializeIncidentStatus} from './src/incident-status.js';

// D1 mínimo sobre node:sqlite: prepare().bind().first()/run()/all().
function env(){const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,screen TEXT,subject TEXT,status TEXT,priority TEXT,assignee TEXT,created_at INTEGER,updated_at INTEGER,resolved_at INTEGER,proof_image TEXT);CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id TEXT,ts INTEGER,kind TEXT,author TEXT,text TEXT)");
 const wrap=sql=>({bind:(...v)=>({first:async()=>db.prepare(sql).get(...v)||null,run:async()=>{const r=db.prepare(sql).run(...v);return {meta:{changes:r.changes}};},all:async()=>({results:db.prepare(sql).all(...v)})})});
 return {db,env:{DB:{prepare:wrap}}};}
const deps=(held=null)=>({portalAssigned:async()=>held,addEvent:async(e,id,kind,author,text)=>e.DB.prepare('INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)').bind(id,Date.now(),kind,author,text).run()});
const R='demo:starbucks-alsea-paseo-de-gracia:pantalla-1:manual:abc';

test('cerrar desde el gemelo: sólo demo:, idempotente, con quién y nota de resolución',async()=>{
 assert.equal(normalizeIncidentAction({close:true,resource:'svc:https://x'}).ok,false);
 assert.equal(normalizeIncidentAction({close:true}).ok,false);
 assert.equal(normalizeIncidentAction({resource:R}).ok,false);
 const {db,env:e}=env();db.prepare("INSERT INTO tickets VALUES('INC-TEST01',?,'Pantalla 1','open','alta','Sofía P.',1,1,NULL,NULL)").run(R);
 db.prepare("INSERT INTO tickets VALUES('INC-REAL01','svc:https://www.xpaceos.com','Web','open','alta','x',1,1,NULL,NULL)").run();
 assert.equal((await applyIncidentAction(e,normalizeIncidentAction({close:true,id:'INC-REAL01'}),deps())).status,404);
 const start=await applyIncidentAction(e,normalizeIncidentAction({start:true,id:'inc-test01',by:'Carlos'}),deps());assert.equal(start.body.stage,'en_curso');
 const held=await applyIncidentAction(e,normalizeIncidentAction({close:true,resource:R}),deps({technician_name:'Ana'}));assert.equal(held.status,409);
 const c=await applyIncidentAction(e,normalizeIncidentAction({close:true,resource:R,by:'XpaceOS Matrix',note:'Cable HDMI recolocado'}),deps());
 assert.equal(c.status,200);assert.equal(c.body.applied,true);assert.equal(c.body.stage,'cerrada');
 const again=await applyIncidentAction(e,normalizeIncidentAction({close:true,id:'INC-TEST01'}),deps());assert.equal(again.body.applied,false);assert.equal(again.body.stage,'cerrada');
 const t=db.prepare("SELECT * FROM tickets WHERE id='INC-TEST01'").get(),ev=db.prepare("SELECT ticket_id,ts,kind,author,text FROM events").all();
 const s=serializeIncidentStatus(t,ev);assert.equal(s.stage,'cerrada');assert.equal(s.closed_by,'XpaceOS Matrix');assert.equal(s.resolution,'Cable HDMI recolocado');assert.ok(s.resolved_at>0);
});
